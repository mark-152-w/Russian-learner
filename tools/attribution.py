#!/usr/bin/env python3
"""Credits for every Tatoeba sentence the app ships: public/credits/tatoeba.txt.

Tatoeba sentences are CC BY 2.0 FR, which asks for credit to each sentence's author. The snapshot
(tools/raw/tatoeba/rus-eng.zip, from manythings.org/anki) names them per pair:
  "CC-BY 2.0 (France) Attribution: tatoeba.org #<en id> (<user>) & #<ru id> (<user>)".
This reads the shipped src/data/sentences/*.json and writes one row per sentence: the Russian sentence id and
author, then the id and author of each English translation shown with it. The file is served with the site
(not precached) and linked from the Attributions page. Run after tools/sentences.py; a test checks it's current.
"""
from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIP = ROOT / "tools" / "raw" / "tatoeba" / "rus-eng.zip"
SENTENCES = ROOT / "src" / "data" / "sentences"
OUT = ROOT / "public" / "credits" / "tatoeba.txt"
ATTR = re.compile(r"#(\d+) \(([^)]*)\) & #(\d+) \(([^)]*)\)")

# starts with a byte-order mark so browsers read it as UTF-8 even when the server names no charset
HEADER = """\ufeff# Tatoeba sentences used in Медведь (https://github.com/mark-152-w/Russian-learner)
# Source: Tatoeba (https://tatoeba.org), via the manythings.org/anki rus-eng file (https://www.manythings.org/anki/).
# Licence: CC BY 2.0 FR (https://creativecommons.org/licenses/by/2.0/fr/).
# Changes: sentences were selected by vocabulary level, stress marks were added to the Russian, and ё was
# restored where the dictionary has it. Translations are shown unchanged.
# Each sentence's page: https://tatoeba.org/en/sentences/show/<id>
# Columns: russian_id, russian_author, then english_id:english_author for each translation shown.
"""


def credits() -> str:
    by_ru: dict[str, dict[str, tuple[str, str]]] = {}  # ru id → en text → (en id, en author)
    ru_author: dict[str, str] = {}
    for line in zipfile.ZipFile(ZIP).read("rus.txt").decode("utf-8").splitlines():
        en, _ru, attr = line.split("\t")
        m = ATTR.search(attr)
        if not m:
            raise SystemExit(f"unexpected attribution: {attr}")
        en_id, en_user, ru_id, ru_user = m.groups()
        ru_author[ru_id] = ru_user
        by_ru.setdefault(ru_id, {}).setdefault(en, (en_id, en_user))
    # sentences.py merges duplicate Russian texts under the first id, so a translation can come from a twin
    # sentence with the same text: look it up across all lines with that English text as a fallback
    en_any: dict[str, tuple[str, str]] = {}
    for tr in by_ru.values():
        for en, v in tr.items():
            en_any.setdefault(en, v)

    rows = []
    for f in sorted(SENTENCES.glob("*.json")):
        for s in json.loads(f.read_text(encoding="utf-8")):
            rid = s["id"].removeprefix("s:")
            if rid not in ru_author:
                raise SystemExit(f"{s['id']}: not in the Tatoeba snapshot")
            ens = [by_ru[rid].get(en) or en_any.get(en) for en in s["en"]]
            if None in ens:
                raise SystemExit(f"{s['id']}: a translation isn't in the snapshot")
            rows.append((int(rid), "\t".join([rid, ru_author[rid], *(f"{i}:{u}" for i, u in ens)])))
    rows.sort()
    return HEADER + "\n".join(r for _, r in rows) + "\n"


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = credits()
    OUT.write_text(text, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {text.count(chr(10)) - HEADER.count(chr(10))} sentences")


if __name__ == "__main__":
    main()
