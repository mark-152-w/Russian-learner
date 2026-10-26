#!/usr/bin/env python3
"""Build the normalised lexicon from pinned sources.

  tools/raw/openrussian/*.csv + tools/raw/frequency/*.txt + tools/overrides.json
    -> src/data/lexicon/{A1..C2,X*}.json, index.json, slots.json
    -> src/data/stats/coverage.json, src/data/meta.json
    -> tools/reports/*.tsv + ingest_summary.md

Every inflected form is cross-checked with pymorphy3 (lemma + grammemes). Form cells
use a compact encoding, documented in schemas/lexeme.schema.json:
  variants joined by "|"; a leading "*" marks a rare/archaic variant, a leading "?"
  marks a variant that is unverified (pymorphy3 disagrees, or it lacks a stress mark).
Generators must only use unmarked variants.
"""
from __future__ import annotations

import collections
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rulib import (ACUTE, UNSTRESSED_OK, fold, from_dataset, has_stress, put_stress,  # noqa: E402
                   strip_stress, stress_index, syllables, transfer_stress, marks_ok)
from morph import (lemma_keys, CASES, PERSONS, SLOTS, dparses, group_of, lemma_parse, preferred,  # noqa: E402
                   verify)

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "raw"
OUT = ROOT / "src" / "data"
REPORTS = ROOT / "tools" / "reports"

POS_LETTER = {"noun": "n", "verb": "v", "adj": "a", "other": "o"}

# Level bands by lemma frequency rank (no level tags exist in the source CSVs; see PROGRESS.md).
LEVEL_BANDS = [("A1", 600), ("A2", 1500), ("B1", 3000), ("B2", 5500), ("C1", 9000), ("C2", 10**9)]
EXT_CHUNK_SIZE = 6000
DISAGREE_RANK_LIMIT = 10000
REPAIR_VERB_RANK_LIMIT = 1500  # among verbs only (~ overall rank 5000); every repair is listed in reports/

# --------------------------------------------------------------------------- cell parsing
JUNK = re.compile(r"[^А-Яа-яЁё'`\- ]")
report_junk: list[tuple] = []


def parse_cell(raw: str, ctx: tuple) -> list[tuple[str, bool]]:
    raw = (raw or "").strip()
    if not raw or raw in ("—", "-"):
        return []
    raw = re.sub(r"\[\[[^\]]*\]\]\s*", "", raw)
    out, seen = [], set()
    for part in re.split(r"//|\s/\s|/|[,;]", raw):
        p = part.strip()
        rare = False
        if p.startswith("(") and p.endswith(")"):
            p, rare = p[1:-1].strip(), True
        if p.startswith("*"):
            p, rare = p.lstrip("*").strip(), True
        if not p:
            continue
        if JUNK.search(p) or " " in p or p.startswith("-") or p.endswith("-"):
            report_junk.append((*ctx, part))
            continue
        f = from_dataset(p)
        if syllables(f) <= 1:
            f = f.replace(ACUTE, "")
        if f not in seen:
            seen.add(f)
            out.append((f, rare))
    return out


def split_senses(s: str) -> list[str]:
    senses = [x.strip(" ,") for x in (s or "").split(";")]
    return [x for x in senses if x]


# --------------------------------------------------------------------------- frequency
DOMINANT_SHARE = 0.75


def load_frequency():
    cyr = re.compile(r"^[а-яё-]+$")
    total = 0
    with open(RAW / "frequency" / "ru_full.txt", encoding="utf-8") as f:
        for line in f:
            w, _, c = line.rstrip("\n").rpartition(" ")
            if cyr.match(w):
                total += int(c)
    lemma_freq: dict[tuple, float] = collections.defaultdict(float)
    unambiguous: dict[tuple, float] = collections.defaultdict(float)
    unknown_mass = 0
    with open(RAW / "frequency" / "ru_50k.txt", encoding="utf-8") as f:
        for line in f:
            w, _, c = line.rstrip("\n").rpartition(" ")
            if not cyr.match(w):
                continue
            c = int(c)
            ps = dparses(w)
            if not ps:
                unknown_mass += c
                continue
            weights = [max(p.score, 1e-6) for p in ps]
            tw = sum(weights)
            share: dict[tuple, float] = collections.defaultdict(float)
            for p, wt in zip(ps, weights):
                share[(fold(p.normal_form), group_of(p))] += wt / tw
            for key, sh in share.items():
                lemma_freq[key] += c * sh
                # evidence: the form belongs to this lemma alone, or pymorphy3 clearly prefers it
                # (кафе́ also parses as a rare noun "каф", but only marginally)
                if sh >= DOMINANT_SHARE:
                    unambiguous[key] += c
    # Inflecting words must be backed by forms that belong to them alone. Otherwise a rare homonym
    # inherits the mass of a frequent word (ага́ "cane toad" from ага "yep", уж "grass snake" from уже́).
    for key, t in lemma_freq.items():
        if key[1] in ("noun", "verb", "adj") and unambiguous[key] < 0.1 * t:
            lemma_freq[key] = min(t, 10 * unambiguous[key])
    return lemma_freq, total, unknown_mass


# --------------------------------------------------------------------------- dataset rows
def read_csv(name):
    with open(RAW / "openrussian" / f"{name}.csv", encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def raw_cells(pos: str, r: dict) -> dict[str, str]:
    if pos == "noun":
        return {f"{n}_{c}": r[f"{n}_{'inst' if c == 'ins' else c}"] for n in ("sg", "pl") for c in CASES}
    if pos == "verb":
        d = {"inf": r["accented"]}
        for i, p in enumerate(PERSONS):
            d[f"np_{p}"] = r[f"presfut_{p[1:]}{p[0]}"]
        for g in ("m", "f", "n", "pl"):
            d[f"pst_{g}"] = r[f"past_{g}"]
        d["imp_sg"], d["imp_pl"] = r["imperative_sg"], r["imperative_pl"]
        return d
    if pos == "adj":
        d = {}
        for g in ("m", "f", "n", "pl"):
            for c in CASES:
                d[f"{g}_{c}"] = r[f"decl_{g}_{'inst' if c == 'ins' else c}"]
        for g in ("m", "f", "n", "pl"):
            d[f"short_{g}"] = r[f"short_{g}"]
        d["comp"], d["sup"] = r["comparative"], r["superlative"]
        return d
    return {}


def main():
    overrides = json.loads((ROOT / "tools" / "overrides.json").read_text(encoding="utf-8"))
    print("loading frequency…", flush=True)
    lemma_freq, total_tokens, unknown_mass = load_frequency()

    files = [("noun", "nouns"), ("verb", "verbs"), ("adj", "adjectives"), ("other", "others")]
    lexemes: list[dict] = []
    stats = collections.Counter()
    print("parsing dataset…", flush=True)
    for pos, fname in files:
        for r in read_csv(fname):
            stats[f"rows_{pos}"] += 1
            bare = r["bare"].strip()
            ctx = (pos, bare)
            cells = {k: parse_cell(v, ctx + (k,)) for k, v in raw_cells(pos, r).items()}
            if pos == "noun" and r["indeclinable"] == "1" and not any(cells.values()):
                # кафе́, метро́, ко́фе: the dataset leaves the table empty; every form is the lemma
                lemma_cell = parse_cell(r["accented"], ctx + ("sg_nom",))
                cells = {k: list(lemma_cell) for k in cells if not (r["sg_only"] == "1" and k.startswith("pl_"))}
                stats["indeclinable_filled"] += 1
            if pos != "other" and not any(v for k, v in cells.items() if k != "inf"):
                stats[f"dropped_no_table_{pos}"] += 1
                continue
            en = split_senses(r["translations_en"])
            lx = {"pos": pos, "bare": bare, "accented": r["accented"].strip(), "en": en,
                  "cells": cells, "row": r, "flags": set()}
            lexemes.append(lx)

    # Global stressed-form map (for inferring stress of unmarked words from elsewhere in the data).
    stressed_map: dict[str, set] = collections.defaultdict(set)
    for lx in lexemes:
        for vs in lx["cells"].values():
            for f, rare in vs:
                if has_stress(f) and not rare:
                    stressed_map[fold(f)].add(f)
        acc = from_dataset(lx["accented"])
        if has_stress(acc) and " " not in acc:
            stressed_map[fold(acc)].add(acc)

    rep_unverified, rep_inferred, rep_disagree, rep_unstressed, rep_loc2 = [], [], [], [], []
    rep_repaired: list[tuple] = []

    def fix_stress(f: str, ctx) -> tuple[str, bool]:
        """Return (form, stressed_ok). Tries ё restoration then dataset-internal inference."""
        if syllables(f) <= 1 or has_stress(f) or f.lower() in UNSTRESSED_OK:
            return f, True
        ps = dparses(strip_stress(f).lower())
        words_ = {p.word for p in ps}
        if len(words_) == 1:
            w = next(iter(words_))
            if "ё" in w and fold(w) == fold(f):
                cand = "".join(("ё" if a == "ё" else b) for a, b in zip(w, f.lower())) if len(w) == len(f) else w
                if f[0].isupper():
                    cand = cand[0].upper() + cand[1:]
                return cand, True
        cands = stressed_map.get(fold(f), set())
        idx = {stress_index(c) for c in cands}
        if len(idx) == 1 and None not in idx:
            new = next(iter(cands)) if len(cands) == 1 else put_stress(f, next(iter(idx)))
            rep_inferred.append((*ctx, f, new))
            return new, True
        return f, False

    homographs = collections.Counter((lx["pos"], lx["bare"]) for lx in lexemes)
    # provisional frequency of the verb lemma (repairs are only trusted where a human reviews them: top ranks)
    verb_freq = sorted((v for (k, g), v in lemma_freq.items() if g == "verb"), reverse=True)
    repair_min_freq = verb_freq[min(len(verb_freq) - 1, REPAIR_VERB_RANK_LIMIT)] if verb_freq else 0
    print("verifying forms with pymorphy3…", flush=True)
    for lx in lexemes:
        pos, bare = lx["pos"], lx["bare"]
        acc = from_dataset(lx["accented"])
        if syllables(acc) <= 1:
            acc = acc.replace(ACUTE, "")
        lx["lemma"], ok = fix_stress(acc, (pos, bare, "lemma"))
        if not ok:
            # fall back to the first stressed nominative/infinitive form in the table
            first = lx["cells"].get({"noun": "sg_nom", "adj": "m_nom"}.get(pos, "inf"), [])
            for f, rare in first:
                if fold(f) == fold(acc) and has_stress(f):
                    lx["lemma"], ok = f, True
                    break
        if not ok:
            lx["flags"].add("lemma-unstressed")
            rep_unstressed.append((pos, bare, "lemma", acc))
        if pos == "other":
            ps = dparses(fold(bare)) or dparses(bare.lower())
            subs = sorted({p.tag.POS for p in ps if p.tag.POS}) if ps else []
            lx["sub"] = subs
            continue
        out_cells: dict[str, list[str]] = {}
        n_ok = n_all = 0
        for slot, vs in lx["cells"].items():
            enc = []
            if lx["lemma"][:1].islower():
                vs = [(v.lower(), r_) for v, r_ in vs]
            cell_folds = {fold(v) for v, _ in vs}
            for f, rare in vs:
                status, word = verify(f, lx["lemma"], pos, slot)
                if status == "gen2":  # partitive (ча́ю, ни ра́зу): real but secondary
                    status, rare = "ok", True
                if status != "ok":
                    lp = lemma_parse(lx["lemma"], pos)
                    pref = preferred(lp, pos, slot) if lp else None
                    if pref and fold(pref) == fold(f):
                        status, word = "ok", pref
                    elif (pref and pos == "verb" and bare != "быть" and slot != "inf" and homographs[(pos, bare)] == 1
                          and lemma_freq.get((fold(bare), "verb"), 0) >= repair_min_freq
                          and fold(pref) not in cell_folds and has_stress(f)):
                        fixed = transfer_stress(f, pref)
                        if fixed:
                            rep_repaired.append((lx, slot, f, fixed))
                            lx["flags"].add("repaired")
                            f, status, word = fixed, "ok", pref
                if not rare and len(vs) > 1 and (
                        (slot in ("f_ins", "sg_ins") and fold(f).endswith(("ою", "ею")))
                        or (slot == "n_acc" and pos == "adj" and fold(f).endswith(("ого", "его")))):
                    rare = True  # archaic/poetic -ою instrumental; animate neuter accusative
                f2, stressed = fix_stress(f, (pos, bare, slot))
                if status == "ok" and word and "ё" in word and "ё" not in f2 and fold(word) == fold(f2) \
                        and not has_stress(f2):
                    f2, stressed = word, True
                n_all += 0 if rare else 1
                verified = status == "ok" and stressed and marks_ok(f2)
                n_ok += 1 if (verified and not rare) else 0
                if not verified:
                    rep_unverified.append((lx, slot, f2, status, "unstressed" if not stressed else ""))
                enc.append(("*" if rare else "") + ("" if verified else "?") + f2)
            out_cells[slot] = enc
        lx["out_cells"] = out_cells
        lx["verified_ratio"] = (n_ok / n_all) if n_all else 0.0
        if n_all and lx["verified_ratio"] < 0.5:
            lx["flags"].add("suspect")

    # ---- fixed-stem-stress propagation inside a paradigm.
    # Only when >= 2 stressed, verified forms with *different endings* put the stress on the same letter of the
    # shared stem; mobile-stress words (рука́/ру́ку, го́род/города́) never qualify.
    rep_propagated = []
    for lx in lexemes:
        if lx["pos"] == "other":
            continue
        cells = lx["out_cells"]
        stressed = [v for vs in cells.values() for v in vs if not v.startswith(("*", "?")) and syllables(v) > 1]
        stressed.append(lx["lemma"]) if has_stress(lx["lemma"]) else None
        positions = set()
        for v in stressed:
            i = stress_index(v)
            if i is None:
                continue
            # letter offset of the stressed vowel in the unstressed word
            bare_v, vi, off = strip_stress(v), -1, None
            for k, ch in enumerate(bare_v):
                if ch in "аеёиоуыэюяАЕЁИОУЫЭЮЯ":
                    vi += 1
                    if vi == i:
                        off = k
                        break
            positions.add((off, fold(bare_v)[:off + 1]))
        if len(positions) != 1:
            continue
        off, prefix = next(iter(positions))
        endings = {fold(strip_stress(v))[off + 1:] for v in stressed}
        if len(endings) < 2:
            continue
        for slot, vs in cells.items():
            for j, v in enumerate(vs):
                if not v.startswith("?"):
                    continue
                body = v[1:]
                if has_stress(body) or not fold(body).startswith(prefix) or len(body) <= off:
                    continue
                if verify(body, lx["lemma"], lx["pos"], slot)[0] not in ("ok",):
                    continue
                new = body[:off + 1] + ACUTE + body[off + 1:]
                vs[j] = new
                rep_propagated.append((lx, slot, body, new))
                lx["flags"].add("stress-propagated")

    # ---- adjective accusative split (dataset stores "inanimate,animate" in one cell)
    for lx in lexemes:
        if lx["pos"] != "adj":
            continue
        c = lx["out_cells"]
        for g in ("m", "pl"):
            acc = c.get(f"{g}_acc", [])
            nom = {fold(x.lstrip("*?")) for x in c.get(f"{g}_nom", [])}
            gen = {fold(x.lstrip("*?")) for x in c.get(f"{g}_gen", [])}
            inan = [x for x in acc if fold(x.lstrip("*?")) in nom]
            an = [x for x in acc if fold(x.lstrip("*?")) in gen]
            other = [x for x in acc if x not in inan and x not in an]
            if not acc:
                inan, an = list(c.get(f"{g}_nom", [])), list(c.get(f"{g}_gen", []))
                if inan or an:
                    lx["flags"].add("acc-derived")
            c[f"{g}_acc"] = inan + other
            c[f"{g}_acc_an"] = an

    # ---- nouns: second locative (в году́) vs prepositional (о го́де)
    for lx in lexemes:
        if lx["pos"] != "noun":
            continue
        c = lx["out_cells"]
        prep = [x for x in c.get("sg_prep", []) if not x.startswith(("*", "?"))]
        if not prep:
            continue
        only_loc2 = True
        for x in prep:
            ps = [p for p in dparses(strip_stress(x).lower()) if fold(p.normal_form) == fold(lx["lemma"])]
            if any("loct" in p.tag.grammemes for p in ps) or not any("loc2" in p.tag.grammemes for p in ps):
                only_loc2 = False
        if not only_loc2:
            continue
        lp = lemma_parse(lx["lemma"], "noun")
        inf = lp.inflect({"sing", "loct"}) if lp else None
        dat = [x for x in c.get("sg_dat", []) if not x.startswith(("*", "?"))]
        c["sg_loc2"] = prep
        if inf and dat:
            d = dat[0]
            pw = inf.word
            if len(strip_stress(d)) == len(pw) and fold(d)[:-1] == fold(pw)[:-1] and stress_index(d) is not None:
                c["sg_prep"] = ["?" + put_stress(pw, stress_index(d)) if "ё" not in pw else "?" + pw]
                lx["flags"].add("loc2")
                rep_loc2.append((lx["bare"], "|".join(prep), c["sg_prep"][0]))
                continue
        c["sg_prep"] = ["?" + x for x in prep]
        lx["flags"].add("loc2")
        rep_loc2.append((lx["bare"], "|".join(prep), "UNRESOLVED"))

    # ---- nouns: generate the second locative where pymorphy3 knows a distinct -у/-ю form.
    # The second locative is always stressed on the ending (в лесу́, на мосту́, в крови́ excepted: -и forms skipped).
    for lx in lexemes:
        if lx["pos"] != "noun" or lx["out_cells"].get("sg_loc2"):
            continue
        lp = lemma_parse(lx["lemma"], "noun")
        if not lp or lp.tag.gender != "masc":
            continue
        l2, lc = lp.inflect({"sing", "loc2"}), lp.inflect({"sing", "loct"})
        if not l2 or not lc or l2.word == lc.word or l2.word[-1] not in "ую":
            continue
        if not any("loc2" in p.tag.grammemes and p.tag.POS == "NOUN" and fold(p.normal_form) == fold(lx["lemma"])
                   for p in dparses(l2.word)):
            continue
        lx["out_cells"]["sg_loc2"] = [put_stress(l2.word, syllables(l2.word) - 1)]
        lx["flags"].add("loc2")

    # ---- frequency ranks
    def keys_for(lx):
        k = fold(lx["lemma"])
        if lx["pos"] == "other":
            return [(k, "other"), (k, "noun"), (k, "adj"), (k, "verb")]
        # A noun-file entry may borrow the 'other' frequency only if it really is a numeral/pronoun
        # (пять, кто). Otherwise the rare noun ага́ ("aga") would inherit the interjection ага's rank.
        if lx["pos"] == "noun" and any(p.tag.POS in ("NUMR", "NPRO") and fold(p.normal_form) == k for p in dparses(k)):
            return [(k, "noun"), (k, "other")]
        # pymorphy3 may file the lemma under another normal form (сча́стье → счастие, де́ньги → деньга)
        return [(k, lx["pos"])] + [(alt, lx["pos"]) for alt in sorted(lemma_keys(lx["lemma"], lx["pos"]) - {k})]

    matched_keys = {}
    for lx in lexemes:
        for key in keys_for(lx):
            if key in lemma_freq:
                lx["fkey"] = key
                matched_keys[key] = lemma_freq[key]
                break
    ranked = sorted(matched_keys.items(), key=lambda kv: -kv[1])
    rank_of = {k: i + 1 for i, (k, _) in enumerate(ranked)}

    # coverage curve: share of all Cyrillic subtitle tokens covered by the top-N dictionary lemmas
    cum, curve = 0.0, []
    for i, (_, fr) in enumerate(ranked, 1):
        cum += fr
        if i % 50 == 0 or i == len(ranked):
            curve.append([i, round(cum / total_tokens, 5)])

    # ---- apply overrides (hand-written; validated by tools/validate.py)
    by_id_tmp: dict[str, dict] = {}
    # Homographs share a frequency key; dataset rows are frequency-sorted, so only the first keeps the rank
    # (пора́ "time to" ranks, по́ра "pore" moves to the extended dictionary).
    ranked_keys: set = set()
    for lx in lexemes:
        k = lx.get("fkey")
        lx["rank"] = rank_of.get(k) if k and k not in ranked_keys else None
        if k:
            ranked_keys.add(k)

    # ---- IDs, levels, gender/animacy, partners
    seen_ids = collections.Counter()
    for lx in lexemes:
        base = f"{POS_LETTER[lx['pos']]}:{lx['bare']}"
        seen_ids[base] += 1
        lx["id"] = base if seen_ids[base] == 1 else f"{base}:{seen_ids[base]}"
        by_id_tmp[lx["id"]] = lx

    for oid, ov in overrides.get("lexemes", {}).items():
        lx = by_id_tmp.get(oid)
        if not lx:
            print(f"WARNING override for unknown id {oid}")
            continue
        for slot, val in ov.get("forms", {}).items():
            lx["out_cells"][slot] = [v for v in val.split("|") if v]
        lx["flags"].discard("suspect")
        if "lemma" in ov:
            lx["lemma"] = ov["lemma"]
            lx["flags"].discard("lemma-unstressed")
        if "en" in ov:
            lx["en"] = ov["en"]
        lx["flags"].add("override")
        if ov.get("review"):
            lx["review"] = True

    verbs_by_bare: dict[str, str] = {}
    for lx in lexemes:
        if lx["pos"] == "verb":
            verbs_by_bare.setdefault(lx["bare"], lx["id"])

    final: list[dict] = []
    rep_no_en: list[tuple] = []
    for lx in lexemes:
        if not lx["en"]:
            stats[f"dropped_no_en_{lx['pos']}"] += 1
            if lx["rank"] and lx["rank"] <= 5000:
                stats["dropped_no_en_top5000"] += 1
                rep_no_en.append((lx["rank"], lx["id"], lx["lemma"]))
            continue
        r = lx["row"]
        out = {"id": lx["id"], "pos": lx["pos"], "lemma": lx["lemma"], "en": lx["en"]}
        if lx["rank"]:
            out["rank"] = lx["rank"]
            out["level"] = next(lv for lv, lim in LEVEL_BANDS if lx["rank"] <= lim)
        if lx["pos"] == "noun":
            g = {"m": "m", "f": "f", "n": "n", "both": "mf", "pl": "pl"}.get(r["gender"])
            an = {"1": True, "0": False}.get(r["animate"])
            if g is None or an is None:
                lp = lemma_parse(lx["lemma"], "noun")
                if lp:
                    if g is None:
                        g = ("pl" if "Pltm" in lp.tag.grammemes else
                             {"masc": "m", "femn": "f", "neut": "n", "ms-f": "mf"}.get(lp.tag.gender))
                        if g:
                            lx["flags"].add("gender-derived")
                    if an is None:
                        an = lp.tag.animacy == "anim"
                        lx["flags"].add("animacy-derived")
            if g:
                out["gender"] = g
            if an:
                out["animate"] = True
            if r["indeclinable"] == "1":
                out["indeclinable"] = True
            if r["sg_only"] == "1":
                out["sgOnly"] = True
            if r["pl_only"] == "1":
                out["plOnly"] = True
        if lx["pos"] == "verb":
            out["aspect"] = {"imperfective": "impf", "perfective": "pf", "both": "both"}.get(r["aspect"], "impf")
            partners = [p.strip() for p in (r["partner"] or "").split(";") if p.strip() and p.strip() != "-"]
            pids = [verbs_by_bare[p] for p in partners if p in verbs_by_bare]
            if pids:
                out["partners"] = pids
        if lx["pos"] == "other" and lx.get("sub"):
            out["sub"] = lx["sub"]
        if lx["pos"] != "other":
            out["forms"] = ["|".join(lx["out_cells"].get(s, [])) for s in SLOTS[lx["pos"]]]
        if lx["flags"]:
            out["flags"] = sorted(lx["flags"])
        if lx.get("review"):
            out["review"] = True
        final.append(out)
        stats[f"kept_{lx['pos']}"] += 1

    # ---- disagreement report vs pymorphy3's preferred inflection (ranked words only)
    print("comparing with pymorphy3 preferred inflections…", flush=True)
    for out in final:
        if out["pos"] == "other" or not out.get("rank") or out["rank"] > DISAGREE_RANK_LIMIT:
            continue
        lp = lemma_parse(out["lemma"], out["pos"])
        if not lp:
            continue
        for slot, cell in zip(SLOTS[out["pos"]], out["forms"]):
            if not cell or slot in ("sup", "sg_loc2", "m_acc_an", "pl_acc_an"):
                continue
            want = preferred(lp, out["pos"], slot)
            if not want:
                continue
            have = {fold(v.lstrip("*?")) for v in cell.split("|") if not v.startswith("*")}
            if slot.endswith("_acc") and out["pos"] == "noun":
                # accusative = nominative (inanimate) or genitive (animate): judge against the dataset's own
                # animacy flag rather than pymorphy3's lemma guess, which often picks the other homonym.
                fm = dict(zip(SLOTS["noun"], out["forms"]))
                src = fm[slot.replace("acc", "gen" if out.get("animate") else "nom")]
                if have and have <= {fold(v.lstrip("*?")) for v in src.split("|")}:
                    continue
            if have and fold(want) not in have:
                rep_disagree.append((out["rank"], out["id"], slot, cell, want))

    tsv(REPORTS / "repaired_verb_forms.tsv", ["rank", "id", "slot", "dataset", "repaired"],
        sorted(((lx.get("rank") or 10**6, lx["id"], *rest) for lx, *rest in rep_repaired), key=lambda r: (r[0], r[1])))
    tsv(REPORTS / "stress_propagated.tsv", ["rank", "id", "slot", "was", "now"],
        sorted(((lx.get("rank") or 10**6, lx["id"], *rest) for lx, *rest in rep_propagated), key=lambda r: (r[0], r[1])))
    tsv(REPORTS / "dropped_no_english_top5000.tsv", ["rank", "id", "lemma"], sorted(rep_no_en))
    write_outputs(final, ranked, curve, total_tokens, unknown_mass, stats,
                  rep_unverified, rep_inferred, rep_disagree, rep_unstressed, rep_loc2)


def write_lines(path: Path, items: list):
    """JSON array with one record per line: small, deterministic, readable git diffs."""
    body = ",\n".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in items)
    path.write_text("[\n" + body + "\n]\n", encoding="utf-8")


def tsv(path: Path, header: list[str], rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)


def write_outputs(final, ranked, curve, total_tokens, unknown_mass, stats,
                  rep_unverified, rep_inferred, rep_disagree, rep_unstressed, rep_loc2):
    lexdir = OUT / "lexicon"
    lexdir.mkdir(parents=True, exist_ok=True)
    for old in lexdir.glob("*.json"):
        old.unlink()
    chunks: dict[str, list] = collections.defaultdict(list)
    unranked = sorted((x for x in final if not x.get("level")), key=lambda x: (fold(x["lemma"]), x["id"]))
    for x in sorted((x for x in final if x.get("level")), key=lambda x: (x["rank"], x["id"])):
        chunks[x["level"]].append(x)
    for i in range(0, len(unranked), EXT_CHUNK_SIZE):
        chunks[f"X{i // EXT_CHUNK_SIZE + 1}"] = unranked[i:i + EXT_CHUNK_SIZE]
    index = {"core": [], "ext": []}
    for name, items in chunks.items():
        write_lines(lexdir / f"{name}.json", items)
        for x in items:
            gloss = x["en"][0] if x["en"] else ""
            index["ext" if name.startswith("X") else "core"].append(
                [x["id"], x["lemma"], x["pos"], x.get("rank", 0), name, gloss[:60]])
    for k, rows in index.items():
        rows.sort(key=lambda r: (r[3] or 10**9, r[0]))
        write_lines(lexdir / f"index-{k}.json", rows)
    (lexdir / "slots.json").write_text(json.dumps(SLOTS, ensure_ascii=False, indent=1), encoding="utf-8")

    stats_dir = OUT / "stats"
    stats_dir.mkdir(parents=True, exist_ok=True)
    (stats_dir / "coverage.json").write_text(json.dumps({
        "description": "Share of Cyrillic word tokens in the OpenSubtitles 2018 Russian frequency list covered by the "
                       "N most frequent dictionary lemmas (all inflected forms of a lemma count as known).",
        "totalTokens": total_tokens, "curve": curve}, ensure_ascii=False), encoding="utf-8")

    sources = json.loads((ROOT / "tools" / "sources.json").read_text(encoding="utf-8"))
    counts = collections.Counter(x["pos"] for x in final)
    levels = collections.Counter(x.get("level", "unranked") for x in final)
    meta = {"sources": {k: {kk: v[kk] for kk in ("name", "url", "licence", "licenceUrl", "commit", "snapshot") if kk in v}
                        for k, v in sources.items() if "status" not in v},  # "status" marks a source not yet available
            "counts": {"lexemes": len(final), **counts}, "levels": dict(sorted(levels.items())),
            "chunks": {k: len(v) for k, v in sorted(chunks.items())}}
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    REPORTS.mkdir(parents=True, exist_ok=True)
    tsv(REPORTS / "unverified_forms.tsv", ["rank", "id", "slot", "form", "pymorphy", "note"],
        sorted(((lx["rank"], lx["id"], *rest) for lx, *rest in rep_unverified if lx.get("rank")),
               key=lambda r: (r[0], r[1])))  # ranked words only; the summary counts all
    tsv(REPORTS / "stress_inferred.tsv", ["pos", "bare", "slot", "was", "now"], rep_inferred)
    tsv(REPORTS / "morph_disagreements.tsv", ["rank", "id", "slot", "dataset", "pymorphy3_preferred"],
        sorted(rep_disagree))
    tsv(REPORTS / "unstressed.tsv", ["pos", "bare", "slot", "form"], rep_unstressed)
    tsv(REPORTS / "loc2.tsv", ["noun", "loc2 (dataset sg_prep)", "derived prepositional"], rep_loc2)
    tsv(REPORTS / "junk_cells.tsv", ["pos", "bare", "slot", "raw"], report_junk)

    def cov_at(n):
        best = None
        for i, c in curve:
            if i <= n:
                best = c
        return best

    ranked_lex = [x for x in final if x.get("rank")]
    top = lambda n, pred: sum(1 for x in ranked_lex if x["rank"] <= n and pred(x))  # noqa: E731
    lines = [
        "# Ingest summary", "",
        "Generated by `tools/ingest.py`. Do not edit by hand.", "",
        "## Source rows", "",
        *[f"- {k}: {v}" for k, v in sorted(stats.items())], "",
        "## Output", "",
        f"- lexemes kept: {len(final)} ({', '.join(f'{k} {v}' for k, v in sorted(counts.items()))})",
        f"- levels: {dict(sorted(levels.items()))}",
        f"- distinct ranked lemma keys: {len(ranked)}",
        f"- Cyrillic tokens in frequency corpus: {total_tokens:,}; tokens in top-50k forms not in pymorphy3 "
        f"dictionary: {unknown_mass:,}", "",
        "## Coverage (lemma-based, OpenSubtitles)", "",
        *[f"- top {n:>5} lemmas: {100 * (cov_at(n) or 0):.1f}% of tokens" for n in
          (100, 500, 1000, 2000, 3000, 5000, 10000)], "",
        "## Quality", "",
        f"- unverified form variants: {len(rep_unverified)}",
        f"- stress inferred from elsewhere in dataset: {len(rep_inferred)}",
        f"- lemmas still unstressed: {len(rep_unstressed)} (top 5000: "
        f"{top(5000, lambda x: 'lemma-unstressed' in x.get('flags', []))})",
        f"- suspect lexemes (<50% forms verified): {sum(1 for x in final if 'suspect' in x.get('flags', []))} "
        f"(top 5000: {top(5000, lambda x: 'suspect' in x.get('flags', []))})",
        f"- disagreements with pymorphy3 preferred form (rank ≤ {DISAGREE_RANK_LIMIT}): {len(rep_disagree)}",
        f"- nouns with a second locative (в лесу́): {sum(1 for x in final if 'loc2' in x.get('flags', []))}"
        f" ({len(rep_loc2)} where the dataset had put it in the prepositional slot)",
        f"- junk cells dropped: {len(report_junk)}",
        f"- verb forms auto-repaired (stress transferred onto pymorphy3 form): "
        f"{sum(1 for x in final if 'repaired' in x.get('flags', []))} lexemes",
    ]
    (REPORTS / "ingest_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
