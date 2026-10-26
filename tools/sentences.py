#!/usr/bin/env python3
"""Build stressed, analysed example sentences from Tatoeba (tools/raw/tatoeba/rus-eng.zip).

A sentence is kept only if every word resolves to a verified form in the core lexicon (A1–C2), the closed-class
table (pronouns, numerals) or the names table, AND all readings of each word agree on spelling and stress.
Sentences where stress depends on context (ру́ки / руки́, все / всё) are dropped rather than guessed.

Output: src/data/sentences/{A1..C1}.json, one record per line:
  {"id": "s:<tatoeba id>", "ru": "<stressed text>", "en": [...], "lv": "A2", "r": <max rank>,
   "w": [[start, end, "lex|slot", ...], ...]}   (offsets into "ru"; one entry per word token)
"""
from __future__ import annotations

import collections
import json
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rulib import UNSTRESSED_OK, fold, has_stress, syllables  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LEX = ROOT / "src" / "data" / "lexicon"
OUT = ROOT / "src" / "data" / "sentences"
REPORTS = ROOT / "tools" / "reports"

WORD = re.compile(r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*")
LEVELS = ["A1", "A2", "B1", "B2", "C1"]
LEVEL_BY_RANK = [("A1", 600), ("A2", 1500), ("B1", 3000), ("B2", 5500), ("C1", 9000)]
LEVEL_BY_LENGTH = [("A1", 5), ("A2", 7), ("B1", 10), ("B2", 13), ("C1", 16)]
EXAMPLES_PER_LEXEME = 6
FUNCTION_RANK = 120  # words this frequent don't justify picking a sentence on their own
POLITE = {"вы", "вас", "вам", "вами", "ваш", "ваша", "ваше", "ваши", "вашего", "вашей", "вашему", "вашим", "вашими", "ваших", "вашу"}


def level_of(rank: int, n_words: int) -> str | None:
    by_rank = next((lv for lv, lim in LEVEL_BY_RANK if rank <= lim), None)
    by_len = next((lv for lv, lim in LEVEL_BY_LENGTH if n_words <= lim), None)
    if not by_rank or not by_len:
        return None
    return LEVELS[max(LEVELS.index(by_rank), LEVELS.index(by_len))]


def load_slots():
    return json.loads((LEX / "slots.json").read_text(encoding="utf-8"))


def build_index(include_ext: bool = False):
    """fold(form) -> list of candidates (lex, slot, stressed form, rank, proper)."""
    slots = load_slots()
    index: dict[str, list[tuple]] = collections.defaultdict(list)
    by_lemma: dict[str, str] = {}
    proper_by_lemma: dict[str, str] = {}
    chunks = ["A1", "A2", "B1", "B2", "C1", "C2"]
    if include_ext:
        chunks += sorted(p.stem for p in LEX.glob("X*.json"))
    for lv in chunks:
        for x in json.loads((LEX / f"{lv}.json").read_text(encoding="utf-8")):
            rank = x.get("rank", 10**6)
            proper = x["lemma"][:1].isupper()
            if proper:
                proper_by_lemma.setdefault(fold(x["lemma"]), x["id"])
            for prefix in ("o:", "n:", "a:", "v:"):
                if x["id"].startswith(prefix):
                    by_lemma.setdefault(prefix + fold(x["lemma"]), x["id"])
            if x["pos"] == "other":
                if "lemma-unstressed" in x.get("flags", []) or " " in x["lemma"]:
                    continue
                index[fold(x["lemma"])].append((x["id"], "", x["lemma"], rank, proper))
                continue
            for slot, cell in zip(slots[x["pos"]], x.get("forms", [])):
                for v in cell.split("|") if cell else []:
                    if v.startswith("?") or v.startswith("*?"):
                        continue
                    f = v.lstrip("*")
                    index[fold(f)].append((x["id"], slot, f, rank, proper))
    closed = json.loads((ROOT / "tools" / "closed_class.json").read_text(encoding="utf-8"))["entries"]
    names: set[str] = set()
    for e in closed:
        lf = fold(e["lemma"])
        if e["kind"] == "name":  # never attach Том to the common noun том "volume"
            lex = proper_by_lemma.get(lf) or f"name:{e['lemma']}"
        else:
            lex = by_lemma.get("o:" + lf) or by_lemma.get("n:" + lf) or f"name:{e['lemma']}"
        rank = 0 if e["kind"] == "name" else None
        if lex.startswith(("o:", "n:")) and e["kind"] != "prep":
            # the closed-class paradigm replaces the bare 'other' lemma entry
            for key in list(index):
                index[key] = [c for c in index[key] if not (c[0] == lex and c[1] == "")]
        for slot, cell in e["forms"].items():
            for f in cell.split("|"):
                # preposition variants (во, со, обо) read as their base preposition, uninflected
                index[fold(f)].append((lex, "" if e["kind"] == "prep" else slot, f, rank, e["kind"] == "name"))
                if e["kind"] == "name":
                    names.add(fold(f))
    # fill closed-class ranks from the lexeme they attach to (or treat as very frequent)
    ranks = {c[0]: c[3] for cs in index.values() for c in cs if c[3] is not None}
    for key, cs in index.items():
        index[key] = [(c[0], c[1], c[2], c[3] if c[3] is not None else ranks.get(c[0], 50), c[4]) for c in cs]
    return index, names


def resolve(token: str, initial: bool, index, names):
    """-> (display form, candidates, rank) or None when unknown/ambiguous."""
    cands = index.get(fold(token))
    if not cands:
        return None
    capital = token[:1].isupper()
    if capital and fold(token) in names:
        cands = [c for c in cands if c[4] and c[0].startswith("name:")] or cands
    elif capital and not initial and fold(token) not in POLITE:
        cands = [c for c in cands if c[4]]  # mid-sentence capital: proper nouns only
        if not cands:
            return None
    elif not capital:
        cands = [c for c in cands if not c[0].startswith("name:")] or cands
    if "ё" in token.lower():
        cands = [c for c in cands if c[2].lower().replace("́", "") == token.lower()]
    displays = {c[2].lower() for c in cands}
    if len(displays) != 1:
        return None
    form = next(iter(displays))
    if syllables(form) > 1 and not has_stress(form) and form not in UNSTRESSED_OK and "-" not in form:
        return None
    if capital:
        form = form[0].upper() + form[1:]
    return form, cands, min(c[3] for c in cands)


def main():
    index, names = build_index()
    print(f"index: {len(index)} surface forms", flush=True)
    z = zipfile.ZipFile(ROOT / "tools" / "raw" / "tatoeba" / "rus-eng.zip")
    pairs: dict[str, dict] = {}
    for line in z.read("rus.txt").decode("utf-8").splitlines():
        en, ru, attr = line.split("\t")
        ru = ru.replace("\u0301", "").replace("\u0300", "")  # a few sentences arrive pre-stressed
        m = re.findall(r"#(\d+)", attr)
        rid = m[1] if len(m) > 1 else (m[0] if m else "0")
        p = pairs.setdefault(ru, {"id": rid, "en": []})
        if len(p["en"]) < 2 and en not in p["en"]:
            p["en"].append(en)

    stats = collections.Counter()
    kept: list[dict] = []
    for ru, p in pairs.items():
        stats["unique"] += 1
        if re.search(r"[A-Za-z0-9]", ru) or any(ord(ch) > 0xFFFF for ch in ru):  # JS offsets = code units
            stats["latin_or_digits"] += 1
            continue
        tokens = list(WORD.finditer(ru))
        if not 2 <= len(tokens) <= 16:
            stats["length"] += 1
            continue
        out, words, max_rank, ok, has_name = [], [], 0, True, False
        pos = 0
        for i, m in enumerate(tokens):
            r = resolve(m.group(0), i == 0, index, names)
            if r is None:
                ok = False
                break
            form, cands, rank = r
            out.append(ru[pos:m.start()])
            start = sum(len(s) for s in out)
            out.append(form)
            analyses = sorted({f"{c[0]}|{c[1]}" for c in cands})
            words.append([start, start + len(form), *analyses])
            max_rank = max(max_rank, rank)
            has_name = has_name or any(c[0].startswith("name:") for c in cands)
            pos = m.end()
        if not ok:
            stats["unresolved_or_ambiguous"] += 1
            continue
        out.append(ru[pos:])
        lv = level_of(max_rank, len(tokens))
        if not lv:
            stats["too_hard"] += 1
            continue
        kept.append({"id": f"s:{p['id']}", "ru": "".join(out), "en": p["en"], "lv": lv, "r": max_rank, "w": words,
                     "_name": has_name})
    stats["candidates"] = len(kept)

    # Greedy selection: up to EXAMPLES_PER_LEXEME examples per content word; prefer no names, then short.
    kept.sort(key=lambda s: (s["_name"], len(s["w"]), s["r"], s["id"]))
    count: collections.Counter = collections.Counter()
    chosen: list[dict] = []
    for s in kept:
        lexes = set()
        for w in s["w"]:
            ls = {a.split("|")[0] for a in w[2:]}
            if len(ls) == 1:
                lexes |= ls
        need = [l for l in lexes if count[l] < EXAMPLES_PER_LEXEME and not l.startswith("name:")]
        if not need:
            continue
        for l in lexes:
            count[l] += 1
        chosen.append(s)

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    per = collections.Counter()
    for lv in LEVELS:
        items = [{k: v for k, v in s.items() if k != "_name"} for s in chosen if s["lv"] == lv]
        items.sort(key=lambda s: s["id"])
        per[lv] = len(items)
        body = ",\n".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in items)
        (OUT / f"{lv}.json").write_text("[\n" + body + "\n]\n", encoding="utf-8")
    lines = ["# Sentence ingest", "", *[f"- {k}: {v}" for k, v in sorted(stats.items())],
             f"- selected: {len(chosen)} ({dict(per)})", f"- lexemes with ≥1 example: {len(count)}"]
    (REPORTS / "sentences_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
