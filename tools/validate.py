#!/usr/bin/env python3
"""Validate generated lexicon and all hand-written content. Exit status 1 on any error.

Checks
  1. JSON Schema for every data file (schemas/*.schema.json).
  2. Duplicate ids (lexicon; content ids across all content files).
  3. Russian text in every string (except id/reference keys):
       - every polysyllabic word carries a stress mark (or ё), except unstressed proclitics;
       - ё is not written as е where pymorphy3 only knows the ё spelling;
       - one primary stress per word; marks only after vowels;
       - unknown words are warnings (errors inside "accept").
     Text inside ~~strikethrough~~ is a deliberately wrong form and is skipped.
  4. Every word of every "accept" answer is a word pymorphy3 knows.
  5. Story tokens: surface form + lemma + grammemes must match a pymorphy3 analysis.
  6. References: lexeme ids, grammar tags, error types, article/unit/exercise ids exist.
  7. Lexicon: unmarked form variants are stressed and confirmed by pymorphy3.
Also writes tools/reports/review.tsv listing everything marked "review": true.

Usage: python3 tools/validate.py [--full]   (--full re-checks unranked lexicon entries too)
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

sys.path.insert(0, str(Path(__file__).resolve().parent))
from morph import SLOTS, confirms, dparses  # noqa: E402
from rulib import ACUTE, GRAVE, VOWELS, fold, missing_stress_parts, needs_stress, strip_stress, syllables  # noqa: E402,F401

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
SCHEMAS = ROOT / "schemas"
REPORTS = ROOT / "tools" / "reports"

CONTENT_SCHEMAS = {
    "grammar": "grammar-article.schema.json",
    "units": "unit.schema.json",
    "exercises": "exercise.schema.json",
    "stories": "story.schema.json",
    "adventure": "adventure.schema.json",
    "cards": "card.schema.json",
    "idioms": "idiom.schema.json",
}
# String values under these keys are ids/references/enums, not displayed Russian.
NO_STRESS_KEYS = {
    "$schema", "id", "lex", "vocab", "partners", "to", "requires", "sets", "verb", "object", "topic", "start", "flags",
    "article", "related", "grammar", "series", "characters", "art", "generator", "reading", "listening", "unlock",
    "family", "level", "type", "kind", "source", "error", "tags", "exits", "testOut", "action", "rarity", "speaker",
    "register", "pos", "slot", "lexemes", "slots", "case", "number", "gender", "tense", "aspect", "mood", "voice", "degree", "lemmaId",
}
ANSWER_KEYS = {"accept"}
# Values that are wrong Russian on purpose (the "wrong" side of a common-mistakes entry).
DELIBERATELY_WRONG_KEYS = {"wrong"}

STRIKE = re.compile(r"~~.*?~~", re.S)
WORD = re.compile(r"(?<![\ẃ̀-])-?[А-Яа-яЁё́̀]+(?:-[А-Яа-яЁё́̀]+)*-?(?![\ẃ̀])")

ALLOWLIST_PATH = ROOT / "tools" / "allowlist.txt"


class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.review: list[tuple] = []

    def err(self, where: str, msg: str):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where: str, msg: str):
        self.warnings.append(f"{where}: {msg}")


def load_allowlist() -> set[str]:
    if not ALLOWLIST_PATH.exists():
        return set()
    return {fold(line.strip()) for line in ALLOWLIST_PATH.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")}


ALLOW = load_allowlist()


def word_known(w: str) -> bool:
    b = strip_stress(w).lower()
    return bool(dparses(b)) or fold(b) in ALLOW


def yo_required(w: str) -> str | None:
    """If pymorphy3 only knows this word with ё (and the text has е), return the ё spelling."""
    if "ё" in w.lower() or "е" not in w.lower():
        return None
    ps = dparses(strip_stress(w).lower())
    if not ps:
        return None
    spellings = {p.word for p in ps}
    if all("ё" in s for s in spellings) and len(spellings) == 1:
        return next(iter(spellings))
    return None


def compound_agrees(word: str, dict_form: str) -> bool:
    """Hyphenated words: only parts the dictionary marks must agree (ба́ба-яга allows Ба́ба-Яга́)."""
    a, b = word.split("-"), dict_form.split("-")
    if len(a) != len(b) or len(a) < 2:
        return False
    return all(x == y or (fold(x) == fold(y) and ACUTE not in y and "ё" not in y) for x, y in zip(a, b))


def check_text(text: str, where: str, rep: Report, answer: bool = False):
    """Apply the Russian display rules to one string."""
    clean = STRIKE.sub(" ", text)
    # markdown markers aren't letters: «**в**ойти́» is one word, войти́
    clean = clean.replace("**", "").replace("*", "").replace("{{ru:", "").replace("}}", "")
    prev = ""
    for m in WORD.finditer(clean):
        w, prev_word = m.group(0), prev
        prev = w
        # a stressed monosyllable takes the stress of the clitic group: не́ было, на́ пол, за́ руку
        clitic_group = syllables(prev_word) == 1 and ACUTE in prev_word
        if w.startswith("-") or w.endswith("-"):
            continue  # morpheme notation: пере-, -ешь
        if len(w) > 1 and strip_stress(w).isupper():
            continue  # abbreviations read letter by letter: ЙЦУКЕН, СССР, ТРКИ
        # marks must follow vowels
        for i, ch in enumerate(w):
            if ch in (ACUTE, GRAVE) and (i == 0 or w[i - 1] not in VOWELS):
                rep.err(where, f"stress mark not on a vowel in «{w}»")
        for part in w.split("-"):
            if part.count(ACUTE) > 1 or (part.count(ACUTE) == 1 and ("ё" in part.lower())):
                rep.err(where, f"more than one primary stress in «{part}»")
        if missing_stress_parts(w) and not clitic_group:
            rep.err(where, f"missing stress mark in «{w}»")
        if not clitic_group and syllables(w) > 1 and not missing_stress_parts(w):
            known = dictionary_forms().get(fold(w))
            if known and w.lower() not in known and not any(compound_agrees(w.lower(), k) for k in known):
                rep.err(where, f"«{w}» differs from the dictionary: {' / '.join(sorted(known))}")
        yo = yo_required(w)
        if yo:
            rep.err(where, f"write ё: «{w}» → «{yo}»")
        if len(strip_stress(w)) > 1 and not word_known(w):  # single letters are cited, not words
            (rep.err if answer else rep.warn)(where, f"word not in pymorphy3 dictionary: «{w}»")


def walk(node, path: str, rep: Report, key: str | None = None):
    if isinstance(node, dict):
        if node.get("review") is True:
            label = node.get("id") or path
            snippet = json.dumps({k: v for k, v in node.items() if k not in ("tokens", "sentences")},
                                 ensure_ascii=False)[:160]
            rep.review.append((path, label, snippet))
        for k, v in node.items():
            if k in NO_STRESS_KEYS or k in DELIBERATELY_WRONG_KEYS:
                continue
            walk(v, f"{path}.{k}", rep, k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            walk(v, f"{path}[{i}]", rep, key)
    elif isinstance(node, str):
        check_text(node, path, rep, answer=key in ANSWER_KEYS)


# --------------------------------------------------------------------------- dictionary stress index
_DICT: dict[str, set[str]] | None = None


def dictionary_forms() -> dict[str, set[str]]:
    """fold(form) -> every stressed spelling the core lexicon / closed-class table allows (lower case).
    Stressed lines in tools/allowlist.txt add spellings (proper names that clash with common words: Толсто́го)."""
    global _DICT
    if _DICT is None:
        from sentences import build_index
        index, _ = build_index(include_ext=True)
        _DICT = {k: {c[2].lower() for c in cs} for k, cs in index.items()}
        if ALLOWLIST_PATH.exists():
            for line in ALLOWLIST_PATH.read_text(encoding="utf-8").splitlines():
                w = line.strip()
                if w and not w.startswith("#") and ACUTE in w:
                    _DICT.setdefault(fold(w), set()).add(w.lower())
    return _DICT


def validate_sentences(rep: Report, registry, schemas, lex_ids: set[str]):
    validator = Draft202012Validator(schemas["sentences.schema.json"], registry=registry)
    closed = json.loads((ROOT / "tools" / "closed_class.json").read_text(encoding="utf-8"))["entries"]
    names = {f"name:{e['lemma']}" for e in closed if e["kind"] == "name"}
    lemma_of = {}
    for path in (DATA / "lexicon").glob("[ABC][0-9].json"):
        for x in json.loads(path.read_text(encoding="utf-8")):
            lemma_of[x["id"]] = (x["lemma"], x["pos"])
    seen: set[str] = set()
    checked: dict[tuple, bool] = {}
    for path in sorted((DATA / "sentences").glob("*.json")):
        items = json.loads(path.read_text(encoding="utf-8"))
        for e in list(validator.iter_errors(items))[:20]:
            rep.err(f"sentences/{path.name}{list(e.absolute_path)}", e.message)
        for s in items:
            where = f"sentences/{path.name}:{s['id']}"
            if s["id"] in seen:
                rep.err(where, "duplicate sentence id")
            seen.add(s["id"])
            check_text(s["ru"], where, rep)
            for w in s["w"]:
                surface = s["ru"][w[0]:w[1]]
                if not WORD.fullmatch(surface):
                    rep.err(where, f"token offsets {w[0]}:{w[1]} do not cover a word ({surface!r})")
                    continue
                for a in w[2:]:
                    lex, slot = a.split("|")
                    if lex.startswith("name:"):
                        if lex not in names:
                            rep.err(where, f"unknown name {lex}")
                        continue
                    if lex not in lex_ids:
                        rep.err(where, f"unknown lexeme {lex}")
                        continue
                    lemma, pos = lemma_of.get(lex, (None, None))
                    if not slot or pos == "other" or not lemma or slot not in SLOTS[pos]:
                        continue  # uninflected or closed-class (closed-class table is checked separately)
                    key = (surface.lower(), lemma, pos, slot)
                    if key not in checked:
                        checked[key] = confirms(surface, lemma, pos, slot)
                    if not checked[key]:
                        rep.err(where, f"«{surface}» is not {slot} of {lemma} per pymorphy3")


def validate_closed_class(rep: Report):
    oc = {"nom": "nomn", "gen": "gent", "dat": "datv", "acc": "accs", "ins": "ablt", "prep": "loct"}
    gm = {"m": "masc", "f": "femn", "n": "neut", "pl": "plur"}
    for e in json.loads((ROOT / "tools" / "closed_class.json").read_text(encoding="utf-8"))["entries"]:
        lf = fold(e["lemma"])
        if e["kind"] == "prep":
            for v in e["forms"].values():
                if not any(p.tag.POS == "PREP" for p in dparses(strip_stress(v).lower())):
                    rep.err(f"closed_class.json:{e['lemma']}", f"«{v}» is not a preposition per pymorphy3")
            continue
        for slot, cell in e["forms"].items():
            parts = slot.split("_")
            want = {oc[parts[-1]]} | ({gm[parts[0]]} if len(parts) == 2 else set())
            for v in cell.split("|"):
                check_text(v, f"closed_class.json:{e['lemma']}:{slot}", rep)
                ps = [p for p in dparses(strip_stress(v).lower()) if fold(p.normal_form) == lf]
                if not any(want <= p.tag.grammemes or "Fixd" in p.tag.grammemes for p in ps):
                    rep.err(f"closed_class.json:{e['lemma']}", f"{slot} «{v}» not confirmed by pymorphy3")


# --------------------------------------------------------------------------- story token analysis
POS_MAP = {
    "noun": {"NOUN"}, "verb": {"VERB", "INFN"}, "adj": {"ADJF", "ADJS"}, "pron": {"NPRO", "ADJF"},
    "num": {"NUMR", "ADJF"}, "adv": {"ADVB"}, "prep": {"PREP"}, "conj": {"CONJ"}, "part": {"PRCL"},
    "intj": {"INTJ"}, "pred": {"PRED"}, "prtf": {"PRTF"}, "prts": {"PRTS"}, "grnd": {"GRND"}, "comp": {"COMP"},
    "name": {"NOUN"},
}
G_MAP = {
    "case": {"nom": "nomn", "gen": "gent", "dat": "datv", "acc": "accs", "ins": "ablt", "prep": "loct",
             "loc2": "loc2", "gen2": "gen2", "voc": "voct"},
    "number": {"sg": "sing", "pl": "plur"},
    "gender": {"m": "masc", "f": "femn", "n": "neut"},
    "person": {1: "1per", 2: "2per", 3: "3per"},
    "tense": {"past": "past", "pres": "pres", "fut": "futr"},
    "aspect": {"impf": "impf", "pf": "perf"},
    "mood": {"imp": "impr"},
    "voice": {"act": "actv", "pass": "pssv"},
    "degree": {"sup": "Supr"},
}


def check_token(tok: dict, where: str, rep: Report, lex_ids: set[str]):
    t = tok["t"]
    if not WORD.fullmatch(t):
        return  # punctuation / numbers
    if "lemma" not in tok or "g" not in tok:
        rep.err(where, f"word token «{t}» needs lemma and g (analysis)")
        return
    if tok.get("lex") and tok["lex"] not in lex_ids:
        rep.err(where, f"unknown lexeme id {tok['lex']}")
    g = tok["g"]
    want_pos = POS_MAP.get(g.get("pos"), set())
    want = set()
    for k, mapping in G_MAP.items():
        if k in g and g[k] in mapping:
            want.add(mapping[g[k]])
    lemma_f = fold(tok["lemma"])
    for p in dparses(strip_stress(t).lower()):
        if want_pos and p.tag.POS not in want_pos:
            continue
        if g.get("short") and p.tag.POS not in ("ADJS", "PRTS"):
            continue
        if fold(p.normal_form) != lemma_f and not (p.tag.POS in ("PRTF", "PRTS", "GRND") or g.get("pos") == "pron"):
            continue
        if want <= p.tag.grammemes:
            return
    if fold(t) in ALLOW and fold(tok["lemma"]) in ALLOW:
        return
    rep.err(where, f"analysis of «{t}» (lemma {tok['lemma']}, {g}) does not match any pymorphy3 parse")


# --------------------------------------------------------------------------- lexicon
def validate_lexicon(rep: Report, full: bool, registry, schemas):
    overrides = json.loads((ROOT / "tools" / "overrides.json").read_text(encoding="utf-8"))["lexemes"]
    trusted = {(lid, s) for lid, ov in overrides.items() for s in ov.get("trust", [])}
    for lid, ov in overrides.items():
        if ov.get("trust") and not ov.get("note"):
            rep.err(f"overrides.json:{lid}", "'trust' requires a 'note'")
    lex_ids: set[str] = set()
    validator = Draft202012Validator(schemas["lexeme.schema.json"], registry=registry)
    for path in sorted((DATA / "lexicon").glob("*.json")):
        if path.name.startswith(("index", "slots")):
            continue
        items = json.loads(path.read_text(encoding="utf-8"))
        for e in validator.iter_errors(items):
            rep.err(f"{path.name}{list(e.absolute_path)}", e.message)
            if len(rep.errors) > 50:
                return lex_ids
        for x in items:
            where = f"lexicon/{path.name}:{x['id']}"
            if x["id"] in lex_ids:
                rep.err(where, "duplicate lexeme id")
            lex_ids.add(x["id"])
            if x.get("review"):
                rep.review.append((where, x["id"], x["lemma"]))
            if needs_stress(x["lemma"]) and "lemma-unstressed" not in x.get("flags", []):
                rep.err(where, f"lemma «{x['lemma']}» lacks stress but is not flagged")
            if x["pos"] == "other":
                continue
            slots = SLOTS[x["pos"]]
            if len(x["forms"]) != len(slots):
                rep.err(where, f"{len(x['forms'])} cells, expected {len(slots)}")
                continue
            deep = full or x.get("rank") or "override" in x.get("flags", [])
            for slot, cell in zip(slots, x["forms"]):
                for v in cell.split("|") if cell else []:
                    if v.startswith(("*", "?")):
                        continue
                    if needs_stress(v):
                        rep.err(where, f"{slot}: unmarked variant «{v}» lacks stress")
                    if deep and (x["id"], slot) not in trusted and not confirms(v, x["lemma"], x["pos"], slot):
                        rep.err(where, f"{slot}: pymorphy3 does not confirm «{v}»")
    for idx in ("index-core.json", "index-ext.json"):
        rows = json.loads((DATA / "lexicon" / idx).read_text(encoding="utf-8"))
        missing = [r[0] for r in rows if r[0] not in lex_ids]
        if missing:
            rep.err(idx, f"{len(missing)} index rows point to missing lexemes, e.g. {missing[:3]}")
    return lex_ids


# --------------------------------------------------------------------------- content
def collect_ids(node, out: list[tuple[str, str]], path: str):
    if isinstance(node, dict):
        if isinstance(node.get("id"), str):
            out.append((node["id"], path))
        for k, v in node.items():
            collect_ids(v, out, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            collect_ids(v, out, f"{path}[{i}]")


def refs(node, key: str, path: str = ""):
    """Yield (path, value) for every string under `key` (string or list of strings)."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == key:
                for s in ([v] if isinstance(v, str) else v if isinstance(v, list) else []):
                    if isinstance(s, str):
                        yield f"{path}.{k}", s
            yield from refs(v, key, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from refs(v, key, f"{path}[{i}]")


def validate_content(rep: Report, registry, schemas, lex_ids: set[str]):
    taxonomy_validator = Draft202012Validator(schemas["taxonomy.schema.json"], registry=registry)
    tax = {}
    for name in ("errors", "tags"):
        doc = json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))
        for e in taxonomy_validator.iter_errors(doc):
            rep.err(f"{name}.json{list(e.absolute_path)}", e.message)
        ids = [x["id"] for x in doc["items"]]
        for i in {i for i in ids if ids.count(i) > 1}:
            rep.err(f"{name}.json", f"duplicate id {i}")
        tax[name] = set(ids)
        walk(doc, f"{name}.json", rep)

    docs: list[tuple[str, str, object]] = []
    content_root = DATA / "content"
    for sub, schema_name in CONTENT_SCHEMAS.items():
        validator = Draft202012Validator(schemas[schema_name], registry=registry)
        for path in sorted((content_root / sub).glob("**/*.json")) if (content_root / sub).exists() else []:
            rel = str(path.relative_to(DATA))
            try:
                doc = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                rep.err(rel, f"invalid JSON: {e}")
                continue
            for e in validator.iter_errors(doc):
                rep.err(f"{rel}{list(e.absolute_path)}", e.message)
            docs.append((sub, rel, doc))

    # ids
    all_ids: list[tuple[str, str]] = []
    for sub, rel, doc in docs:
        collect_ids(doc, all_ids, rel)
    seen: dict[str, str] = {}
    for i, where in all_ids:
        if i in seen:
            rep.err(where, f"duplicate id {i} (also at {seen[i]})")
        seen.setdefault(i, where)
    content_ids = set(seen)

    for sub, rel, doc in docs:
        walk(doc, rel, rep)
        for where, v in refs(doc, "vocab", rel):
            if v not in lex_ids:
                rep.err(where, f"unknown lexeme id {v}")
        for where, v in refs(doc, "lex", rel):
            if v not in lex_ids:
                rep.err(where, f"unknown lexeme id {v}")
        for where, v in refs(doc, "tags", rel):
            if v not in tax["tags"]:
                rep.err(where, f"unknown grammar tag {v}")
        for where, v in refs(doc, "error", rel):
            if v not in tax["errors"]:
                rep.err(where, f"unknown error type {v}")
        for key in ("grammar", "related", "article", "reading", "listening"):
            for where, v in refs(doc, key, rel):
                if v not in content_ids:
                    rep.err(where, f"unknown {key} reference {v}")
        if sub == "units":
            for d in doc.get("drills", []):
                for v in d.get("items", []):
                    if v not in content_ids:
                        rep.err(rel, f"unknown exercise id {v}")
        if sub in ("stories", "cards"):
            stories = [doc] if sub == "stories" else [c["blurb"] for c in doc.get("cards", [])]
            for st in stories:
                for si, s in enumerate(st.get("sentences", [])):
                    for ti, tok in enumerate(s.get("tokens", [])):
                        check_token(tok, f"{rel}:sentences[{si}].tokens[{ti}]", rep, lex_ids)



# --------------------------------------------------------------------------- UI source strings
STRING_LIT = re.compile(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`|>[^<>{}]+<")


def validate_sources(rep: Report):
    """Russian inside string literals / JSX text in src/**/*.ts(x) obeys the same display rules.
    Tests and generated files are skipped; a line containing 'ru-ignore' is skipped (character classes etc.)."""
    for path in sorted((ROOT / "src").rglob("*.ts*")):
        if path.name.endswith((".test.ts", ".test.tsx", ".gen.ts", ".d.ts")):
            continue
        rel = str(path.relative_to(ROOT))
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if "ru-ignore" in line or line.lstrip().startswith(("//", "*", "/*")):
                continue
            line = line.split(" // ")[0]
            for lit in STRING_LIT.findall(line):
                if re.search("[А-Яа-яЁё]", lit):
                    check_text(lit, f"{rel}:{n}", rep)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="also re-check unranked lexicon entries")
    ap.add_argument("--skip-lexicon", action="store_true", help="content only (fast)")
    args = ap.parse_args()

    schemas = {p.name: json.loads(p.read_text(encoding="utf-8")) for p in SCHEMAS.glob("*.schema.json")}
    registry = Registry().with_resources((name, Resource.from_contents(s)) for name, s in schemas.items())
    for name, s in schemas.items():
        Draft202012Validator.check_schema(s)

    rep = Report()
    if args.skip_lexicon:
        lex_ids = set()
        for idx in ("index-core.json", "index-ext.json"):
            lex_ids |= {r[0] for r in json.loads((DATA / "lexicon" / idx).read_text(encoding="utf-8"))}
    else:
        lex_ids = validate_lexicon(rep, args.full, registry, schemas)
    validate_closed_class(rep)
    if not args.skip_lexicon:
        validate_sentences(rep, registry, schemas, lex_ids)
    validate_content(rep, registry, schemas, lex_ids)
    validate_sources(rep)

    REPORTS.mkdir(parents=True, exist_ok=True)
    with open(REPORTS / "review.tsv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(["where", "id", "content"])
        w.writerows(rep.review)

    for m in rep.warnings[:40]:
        print("WARN ", m)
    if len(rep.warnings) > 40:
        print(f"WARN  … {len(rep.warnings) - 40} more warnings")
    for m in rep.errors[:200]:
        print("ERROR", m)
    print(f"\n{len(rep.errors)} errors, {len(rep.warnings)} warnings, {len(rep.review)} items marked for review")
    sys.exit(1 if rep.errors else 0)


if __name__ == "__main__":
    main()
