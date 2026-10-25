# Медведь: notes for future sessions

Offline PWA Russian course (A2 → C1). **Zero runtime API calls**: everything ships as static data.
Read `PROGRESS.md` for status, decisions and the review queue. This file covers architecture and conventions.

## Layout

```
tools/                 Python build pipeline (run from repo root)
  sources.json         pinned source datasets (commit hashes, licences)
  fetch_sources.sh     downloads sources into tools/raw/ (gitignored)
  ingest.py            raw CSV/TXT → src/data/lexicon/*, stats/coverage.json, meta.json, tools/reports/*
  morph.py             pymorphy3 verification shared by ingest + validate (slot → grammemes)
  rulib.py             stress/ё helpers (mirror: src/lib/ru.ts)
  validate.py          schema + Russian-text + reference + lexicon checks; exit 1 on errors
  overrides.json       hand corrections to the dictionary (re-verified by validate.py)
  allowlist.txt        (optional) words pymorphy3 doesn't know but are fine (names etc.)
  reports/             generated review reports (ingest_summary.md is the overview)
  tests/               python unittest suite
schemas/               JSON Schemas for every data file (source of truth for TS types)
scripts/gen-types.mjs  schemas → src/types/content.gen.ts (run `npm run gen:types` after schema edits)
src/data/              generated + hand-written data
  lexicon/{A1..C2}.json  ranked words by level (precached core); X1..Xn.json rare tail (optional download)
  lexicon/index-{core,ext}.json  [id, lemma, pos, rank, chunk, gloss] rows for search
  lexicon/slots.json   slot order for the positional `forms` arrays
  errors.json          error taxonomy (grader diagnostics)
  tags.json            grammar tag vocabulary
  content/{grammar,units,exercises,stories,adventure,cards,idioms}/*.json  hand-written content
src/lib/               runtime libraries (ru.ts, lexicon.ts, …)
```

## Commands

- `npm run data:fetch && npm run data:ingest`: rebuild the lexicon (about 80 s). Output is deterministic.
- `npm run data:validate`: must pass before a phase is done (`--full` re-checks the rare tail too, slower).
- `npm run check`: python tests + validate + typecheck + vitest.
- `npm run dev` / `npm run build` (`BASE=/` for root hosting; default base is `/Russian-learner/`).

## Data conventions

- **Lexeme id**: `n:книга`, `v:сказать`, `a:новый`, `o:зачем`; homographs get `:2`, `:3` in dataset order
  (`n:замок` = за́мок castle, `n:замок:2` = замо́к lock). Stable as long as the source commit is pinned.
- **Form cells** (`forms[i]` aligned with `slots.json[pos][i]`): variants joined by `|`; leading `*` = rare or
  archaic; leading `?` = unverified (pymorphy3 disagrees or no stress). **Generators and graders use only
  unmarked variants** (`decodeCell(...).usable`). Accept rare variants as correct answers, but never teach them.
- Slots. Noun: `sg_nom … pl_prep, sg_loc2` (second locative в лесу́; `sg_prep` is always the о-form).
  Verb: `inf, np_1sg … np_3pl` (non-past: present for impf, future for pf), `pst_m/f/n/pl, imp_sg/pl`.
  Adj: `{m,f,n,pl}_{case}`, `m_acc` (inanimate), `m_acc_an`, `pl_acc`, `pl_acc_an`, `short_*`, `comp`, `sup`.
- Levels are **derived from lemma frequency rank** (bands in `ingest.py: LEVEL_BANDS`). The source has no level tags.
- To fix dictionary data, add to `tools/overrides.json` (with a `note`), never edit generated JSON.

## Russian text rules (enforced by validate.py)

- Stress: U+0301 after the stressed vowel (`ру́ку`). Every polysyllabic word in any displayed string needs it,
  except unstressed proclitics (`из-за`, `обо`…) and hyphenated enclitics (`-то`, `-нибудь`). ё never gets U+0301.
- Write ё wherever it belongs; validate.py errors if pymorphy3 only knows the ё spelling.
- Strings under id/reference keys are exempt (`NO_STRESS_KEYS` in validate.py: id, lex, vocab, tags, error, to…).
- Strings under `accept` must be words pymorphy3 knows (error); unknown words elsewhere are warnings.
- Deliberately wrong Russian (distractor shown in an explanation) goes in `~~strikethrough~~`, which validate skips.
- Morpheme notation is skipped automatically: `пере-`, `-ешь`.
- Inline Russian in markdown can be wrapped `{{ru:сло́во}}` to make it tappable/playable in the UI.
- Story tokens need `lemma` + `g` (grammemes); validate checks them against pymorphy3.
- Mark uncertain hand-written Russian with `"review": true`; validate writes `tools/reports/review.tsv`.

## Stack

Vite 8 + React 19 + TypeScript 7 + Tailwind 4, react-router (HashRouter for GitHub Pages), Dexie, ts-fsrs,
vite-plugin-pwa (Phase 1), Vitest. Fonts: PT Sans / PT Serif via @fontsource (self-hosted).
Palette tokens in `src/index.css` (`paper`, `ink`, `red`, `line`); dark mode via `prefers-color-scheme` or
`<html data-theme>`.

## Working rules (from the brief)

Work in phases; after each: run `npm run check`, commit, update PROGRESS.md, stop for review.
Prefer generating content from data; hand-written Russian must pass validate.py. Never stub features with
"coming soon"; hide what isn't built. Before large writing batches, give the user a size estimate.
