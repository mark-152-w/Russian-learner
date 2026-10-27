"""Rare-tail lexemes that hand-written content uses, shipped in src/data/content-tail.json.

The rare tail (lexicon X1..Xn, ~3 MB each, plus a 2.7 MB search index) is cached only on first use. A story with
one tail word (засмея́ться, Петербу́рг…) would otherwise pull the index and a whole chunk just to gloss it, and
break offline. This small precached file holds exactly the tail lexemes referenced by content/** and by lexeme-id
literals in src/ (minimal pairs), so src/lib/lexicon.ts finds them without the tail.

stories.py writes the file; validate.py checks it is complete and matches the lexicon.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
OUT = DATA / "content-tail.json"
ID_LITERAL = re.compile(r"'([navo]:[^'\s]+)'")


def tail_chunks() -> dict[str, list[dict]]:
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((DATA / "lexicon").glob("X[0-9]*.json"))}


def _strings(node):
    if isinstance(node, dict):
        for v in node.values():
            yield from _strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from _strings(v)
    elif isinstance(node, str):
        yield node


def referenced(candidates: set[str]) -> set[str]:
    """Which of `candidates` (tail ids) appear in hand-written content or as id literals in app source."""
    found: set[str] = set()
    for p in (DATA / "content").rglob("*.json"):
        found |= {s for s in _strings(json.loads(p.read_text(encoding="utf-8"))) if s in candidates}
    for p in (ROOT / "src").rglob("*.ts*"):
        if ".test." not in p.name:
            found |= {m for m in ID_LITERAL.findall(p.read_text(encoding="utf-8")) if m in candidates}
    return found


def build() -> list[dict]:
    """Tail lexeme records referenced by content, in chunk order (deterministic)."""
    chunks = tail_chunks()
    ids = referenced({x["id"] for xs in chunks.values() for x in xs})
    return [x for xs in chunks.values() for x in xs if x["id"] in ids]


def write() -> int:
    recs = build()
    OUT.write_text(json.dumps(recs, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return len(recs)
