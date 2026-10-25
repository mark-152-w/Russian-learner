# Progress

## Status

| Phase | State |
|---|---|
| 0: scaffold, ingestion, validation, schemas | **Done** except example sentences, which are **blocked on a file from you** (see "Action needed") |
| 1: shell, storage, PWA, engine, grader, FSRS, rewards | Next |

`npm run check` passes: 19 Python tool tests, `validate.py` with 0 errors and 0 warnings (also `--full` over all
43k entries), typecheck, and 5 Vitest tests. `npm run build` succeeds.

## Action needed: example sentences (Tatoeba)

The brief assumed the OpenRussian repo has example sentences with level tags. **It doesn't.** The GitHub CSVs
(last export 2020-09) contain only nouns, verbs, adjectives and others. Their README says sentences live in the
TogetherDB web database, and that sentences come from Tatoeba. This sandbox can't reach tatoeba.org,
togetherdb.com, manythings.org or huggingface.co (proxy 403). Only GitHub, npm and PyPI are reachable.

Please download **one** of these and commit it:

1. **Easiest:** <https://www.manythings.org/anki/rus-eng.zip> (Tatoeba Russian–English pairs, already zipped,
   about 15 MB, one line per pair with Tatoeba attribution). Commit it unchanged as
   `tools/raw/tatoeba/rus-eng.zip`.
2. Alternative: <https://tatoeba.org/en/downloads>, then "Sentence pairs", Russian → English. Zip the `.tsv` and
   commit it as `tools/raw/tatoeba/rus-eng-pairs.zip`.

GitHub's web uploader accepts files up to 25 MB, so either works from a browser. Licence: CC BY 2.0 FR.
Phase 1 doesn't need sentences, so I can carry on without them. Phase 2 (cloze cards, word-page examples,
lesson drills) does.

Plan for that file: keep sentences whose every token is a verified lexicon form and whose words are all within a
level's vocabulary. Add stress from the lexicon. Drop sentences where stress is ambiguous without context
(ру́ки / руки́, все / всё). Store a per-token analysis verified by pymorphy3.

## What the datasets actually contain

**OpenRussian** (`Badestrand/russian-dictionary` @ 50e210c, CC BY-SA 4.0): 26,982 noun rows, 14,871 verb rows,
11,941 adjective rows and 5,031 "other" rows (adverbs, prepositions, pronouns, conjunctions). Tab-separated.

- Stress is marked by `'` after the vowel, and secondary stress by `` ` ``. `*` marks a rare form, `,` `;` `//`
  ` / ` separate variants, `(…)` marks archaic variants, and some cells contain `[[wiki]]` markup.
- There are full tables (6 cases × 2 numbers; verb non-past, past, imperative; adjective long, short,
  comparative and superlative), aspect and partner verbs, gender, animacy, and English and German translations.
- Dirt found:
  - about 20% of rows have no English translation (dropped, including 139 within the top 5,000, mostly names
    and slang);
  - 5,230 rows have empty tables;
  - 201 corrupt cells (`застону//_устари'`);
  - 2,525 of the 5,031 "others" are unstressed (now 0 within the top 5,000);
  - some systematically wrong paradigms: **год** with the plural лета́; -нуть verbs with bogus pasts
    (поги́бнул); typo'd imperatives (вы́тащь, безпоко́й); some verbs with a corrupted non-past (дождала́ю́сь);
  - the second locative is mostly missing, so в лесу́ appears only as ле́се.
- Rows are frequency-sorted, but **there are no level tags and no sentences**.

**FrequencyWords** (hermitdave @ 525f9b5, OpenSubtitles 2018, CC BY-SA 4.0 for content): 50k word forms plus
the full list (153 M Cyrillic tokens). I lemmatise forms with pymorphy3, splitting ambiguous forms by its
probability scores, to get lemma frequencies.

**pymorphy3 2.0.6 + OpenCorpora dictionary**: used at build time only, to verify every form against lemma and
grammemes. It restores ё (еще → ещё) and supplies second-locative forms. It doesn't know stress.

## Pipeline results (tools/reports/ingest_summary.md)

- 43,174 lexemes kept: 20,361 nouns, 12,175 verbs, 8,519 adjectives, 2,119 others.
- Ranked (by lemma frequency) and given levels: A1 601 · A2 899 · B1 1,474 · B2 2,419 · C1 3,216 · C2 3,781.
  30,784 rare words are unranked.
- Share of form variants usable for drills (verified and stressed): A1 97.7%, A2 97.6%, B1 97.5%, B2 to C2 about
  97.1%. The rest stay visible in the lab, marked, but are never drilled.
- Coverage (honest, lemma-based, subtitles): the top 500 lemmas cover 68.5% of tokens, 1,000 cover 74.9%,
  2,000 cover 80.5%, 5,000 cover 85.9% and 10,000 cover 88.0%. Stored in `src/data/stats/coverage.json` for the
  "you now know N words" milestone.
- Automatic data repairs, each listed in its own report file:
  - ё restoration and stress inference where the dataset itself is unambiguous: 724 forms;
  - fixed-stem-stress propagation inside a paradigm: 147 forms;
  - verb typo repairs: 6 frequent verbs;
  - second locative split out: 141 nouns;
  - archaic -ою and partitive forms re-marked as rare.
- Hand overrides: 19 core words in `tools/overrides.json`, each with a note and re-verified by pymorphy3.

## Decisions and trade-offs

- **React over Svelte.** Dexie and ts-fsrs have mature React usage, you suggested React, and Svelte's smaller
  runtime makes no material difference for this app.
- **Levels come from frequency rank, not from source tags** (the source has none). Bands by rank: A1 ≤ 600,
  A2 ≤ 1,500, B1 ≤ 3,000, B2 ≤ 5,500, C1 ≤ 9,000, then C2. Course units will also pull thematic words regardless
  of band.
- **Subtitle frequency** skews towards dialogue (я, ты, хорошо́), which suits a speaking-oriented learner. Names
  and slang rank high, so decks will need a filter.
- **Offline footprint.** The core dictionary (A1–C2, 13.4k words) is about 1 MB gzipped and will be precached.
  The rare tail (30k words, about 2.5 MB gzipped plus a 0.9 MB index) will be a "download full dictionary for
  offline" option in settings. It loads on demand when online.
- **When pymorphy3 and the dataset disagree:** the dataset wins on stress, and pymorphy3 decides whether a form
  exists. Disagreements are never silently "fixed" except by the narrow, reported rules above.
  - Automatic verb repairs are limited to the 1,500 most frequent verbs, where I can review every case. On rare
    words, pymorphy3 sometimes lacks the correct variant (вы́тянись), so a repair would make things worse.
  - Words with a homograph (опи́сать / описа́ть) are never repaired.
- **Variant handling.** Rare and unverified variants stay in the data (marked `*` / `?`) so that graders can
  accept them, but they are never taught.
- **Generated data is committed** (one record per line, deterministic) so the app builds without Python. CI
  re-validates it.
- **Russian-text rules are enforced by key convention, not per-field schema annotations.** Every string is
  stress-checked except under id/reference keys. Intentionally wrong Russian is written as `~~…~~`.
- **Numerals** (пять, три́дцать…) have broken tables in the source. They'll get hand-built paradigms in the
  numerals trainer (Phase 3) rather than overrides.
- **HashRouter**, so GitHub Pages deep links work without a 404 hack.
- **Deploy workflow added now** (runs on push to `main`) so you can check progress on your phone. Enable it once
  under repo Settings → Pages → Source: GitHub Actions.

## Known issues

- 532 frequent-word disagreements with pymorphy3's preferred forms remain in
  `tools/reports/morph_disagreements.tsv`. I reviewed the top 1,500 by rank: almost all are legitimate
  alternatives where the dataset is right (учителя́, цветы́, коле́ни, чудеса́, о́бразы/образа́). Real errors were
  overridden.
- 9 "suspect" lexemes in the top 5,000: the numerals, опи́сать (vulgar homograph), забра́ло and выпускно́й. They
  are excluded from drills.
- Adjective short forms are often unverified: pymorphy3 lacks many, and many relational adjectives don't really
  have them. They're excluded from drills.
- The generated `ExerciseItem1` and `Story1` types are harmless duplicates from json-schema-to-typescript.

## Content counts

| Content | Count |
|---|---|
| Lexemes | 43,174 (13,390 ranked) |
| Error taxonomy entries | 46 |
| Grammar tags | 71 |
| Grammar articles, units, stories, exercises | 0 (Phase 2+) |

## Review queue (`"review": true`)

None yet. All 19 overrides are common words where I'm confident. Their notes are in `tools/overrides.json`.

## Next: Phase 1 (mostly code; little writing)

Phase 1 covers:

- app shell and routing;
- Dexie schema, settings, and JSON export/import;
- vite-plugin-pwa with offline precache of the core, plus PNG icons;
- the exercise engine with the diagnostic grader and its tests: answer normalisation, stem-only typo tolerance,
  error taxonomy mapping, and distractor diagnostics;
- ts-fsrs scheduling with tests;
- the rewards module: XP with anti-grind rules, combos, Web Audio pentatonic sounds, haptics, chests with rarity
  tiers, golden questions, the happy-hour window, streaks and freezes, daily/weekly quests, and achievements.

The only prose in Phase 1 is short UI strings and achievement names (about 2k words).

**Heads-up for Phase 2 spend:** the A2–B1 grammar articles are the first big writing batch. That's about
28 articles of roughly 1,200–1,800 words each, with 5–10 stressed examples apiece: about 45k words, or roughly
70–90k output tokens. On top of that come about 20 A2 unit definitions (small, mostly data) and about
60 hand-written placement items. I'll confirm before starting it.
