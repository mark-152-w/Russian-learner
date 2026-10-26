# Медведь: notes for future sessions

Offline PWA Russian course (A2 → C1). **Zero runtime API calls**: everything ships as static data.
Read `PROGRESS.md` for status, decisions and the review queue. This file covers architecture and conventions.

## Layout

```
tools/                 Python build pipeline (run from repo root)
  sources.json         pinned source datasets (commit hashes, licences)
  fetch_sources.sh     downloads sources into tools/raw/ (gitignored)
  ingest.py            raw CSV/TXT → src/data/lexicon/*, stats/coverage.json, meta.json, tools/reports/*
  sentences.py         Tatoeba → src/data/sentences/{A1..C1}.json (only fully resolved, unambiguously stressed)
  closed_class.json    stressed paradigms the dataset lacks: pronouns (наш, ваш), numerals (11–19…), names/places,
                       preposition variants (во, со, обо), invariant words (kind "word": как, пусть; with "sub" + "en")
  stories.py           tools/stories/*.txt → src/data/content/stories/*.json + src/data/stories-index.json, with
                       context disambiguation; report in tools/reports/stories.md
  stories/             story/dialogue sources (see the docstring in stories.py for the format and {hints})
  cards/               card-set sources (set header, cards split by '===', blurb lines like stories); stories.py
                       builds them into content/cards/*.json + src/data/cards-index.json
  morph.py             pymorphy3 verification shared by ingest + validate (slot → grammemes)
  rulib.py             stress/ё helpers (mirror: src/lib/ru.ts)
  validate.py          schema + Russian-text + reference + lexicon checks; exit 1 on errors
  overrides.json       hand corrections to the dictionary (re-verified by validate.py)
  allowlist.txt        words pymorphy3 doesn't know but are fine (names etc.); a stressed entry (Толсто́го) also
                       teaches validate's dictionary-stress check that spelling
  reports/             generated review reports (ingest_summary.md is the overview)
  tests/               python unittest suite
schemas/               JSON Schemas for every data file (source of truth for TS types)
scripts/gen-types.mjs  schemas → src/types/content.gen.ts (run `npm run gen:types` after schema edits)
src/data/              generated + hand-written data
  lexicon/{A1..C2}.json  ranked words by level (precached core); X1..Xn.json rare tail (optional download)
  lexicon/index-{core,ext}.json  [id, lemma, pos, rank, chunk, gloss] rows for search
  lexicon/slots.json   slot order for the positional `forms` arrays
  sentences/{A1..C1}.json  {id:"s:<tatoeba>", ru, en[], lv, r, w:[[start,end,"lex|slot"],…]} (B2/C1 runtime-cached)
  stories-index.json   generated library index (id, kind, level, series, chapter, title, words, questions)
  cards-index.json     generated card index (sets → cards: id, name, rarity, art, level; no blurbs)
  errors.json          error taxonomy (grader diagnostics)
  tags.json            grammar tag vocabulary
  content/{grammar,units,exercises,stories,adventure,cards,idioms}/*.json  hand-written content
src/lib/               ru.ts (stress helpers), lexicon.ts (lazy chunks, decodeCell, loadIndex, poolUpTo), rng.ts,
                       ics.ts, sentences.ts (load/examplesFor), content.ts (hand-written JSON via import.meta.glob),
                       drillContext.ts (lexicon + sentences + hand-written for generators), course.ts (unit progress,
                       lesson/checkpoint items), learner.ts (placement result, learner level), coverage.ts
                       ("N words ≈ X%"), plan.ts (Home daily plan, weakest tag, vocabulary milestones),
                       stories.ts (lazy story files, reading progress, analysis labels), bosses.ts (boss records),
                       cards.ts (card index, lazy set files, owned cards), adventure.ts (chapters, progress, flags)
src/engine/            normalize.ts, translit.ts, slots.ts (slot → labels/tags), diagnose.ts (paradigm + spelling
                       rules → error type), grader.ts (all 11 item types), generators.ts (drills from the lexicon),
                       sentenceGen.ts (case/verb cloze, find-error, tiles, declension patterns from sentences),
                       drills.ts (generator registry used by unit JSON; itemsForTag), placement.ts (staircases),
                       trainers.ts (preposition sorting, numerals from closed_class.json, stress items, minimal pairs),
                       listening.ts (dictation, shadowing, ы/и + hard/soft pairs, а́канье), keyboard.ts (ЙЦУКЕН course),
                       arcade.ts (case arcade waves/cards, joinPreposition о→об…), crossword.ts (candidates from the
                       lexicon, grid builder, daySeed), speed.ts (speed match board), boss.ts (HP/hearts, revenge items),
                       town.ts (buildings, levels, ranks), adventure.ts («Де́ло» parser: verb government → explanations),
                       idioms.ts (meaning questions from content/idioms)
src/srs/fsrs.ts        ts-fsrs wrapper; cards stored with epoch-ms dates; ratingFor(verdict, ms)
src/srs/deck.ts        vocabulary deck: card directions, form cards from missed forms, new-word queue, due items
src/db/                Dexie schema (db.ts), settings, backup (export/import/reset)
src/rewards/           pure: xp, levels, chest, streak, quests, achievements, goals; service.ts persists them
src/audio/             sound.ts (Web Audio synth), haptics.ts, tts.ts (speechSynthesis), speech.ts (recognition, Chrome)
src/components/        ui.tsx, Md.tsx (markdown-lite + Ru), juice.tsx, exercises.tsx, SessionRunner (hud/onAnswered
                       hooks for bosses), SessionSummary, Tappable.tsx (analysed tokens + WordSheet), BossArt.tsx
                       (20 parametric portraits), CardFace.tsx (card + NewCard),
                       visuals.tsx (aspect timelines + motion-prefix diagrams; an item's `visual` shows in feedback)
src/pages/             Home, Practice, Review, Course (course/unit/lesson), Placement, Grammar, Lab, Word, Drill
                       (/drill/{word,pattern,cell,tag}/…), Trainers (/trainers = Practice hub, /trainer/:id/:mode),
                       Reader (/reader, /story/:id[/quiz], /dialogue/:id), Listening (/listening, /listen/:mode),
                       Keyboard (/keyboard/:n), Games (/games hub), Arcade (/arcade), Crossword (/crossword[/:topic],
                       'daily' = day-seeded), Speed (/speed), Boss (/boss/:unit), Cards (/cards, /card/:id), Town (/town),
                       Adventure (/adventure, /adventure/:n), Idioms (/idioms, /idioms/practice), Trophies, Settings,
                       Attributions
src/features.ts        features that exist; quests/achievements for anything else stay hidden
```

## How a learning activity plugs in

1. Produce `ExerciseItem`s (hand-written JSON or a generator). Give form items a `target {lex, slot}` so the
   grader can diagnose wrong answers against the paradigm.
2. Render with `<SessionRunner items lexemes kind>`, or call `grade()` yourself and report every answer through a
   `RewardSession` (`answer()` per item, `finish()` at the end). Never award XP directly. The service handles
   XP and anti-grind, combos, mastery (the learner model), quests, achievements, streaks and chests.
3. When a section ships, add its feature flag to `src/features.ts` so its quests and achievements appear.

## Commands

- `npm run data:fetch && npm run data:ingest`: rebuild the lexicon and sentences (a few minutes). Output is
  deterministic. `npm run data:sentences` redoes only the sentences.
- `python3 tools/stories.py`: rebuild stories and cards after editing `tools/stories/*.txt` or `tools/cards/*.txt`
  (exit 1 on problems). Re-run it after any ingest, since lexeme ids/ranks feed the analysis.
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
- Polysyllabic words are checked against the dictionary's stress (lexicon + closed_class + stressed allowlist):
  руку́ is an error. Homographs pass with either stress, so check це́ны/цены́-type words yourself.
- Markdown is only `**bold**`, `*italic*`, `~~wrong~~`, `` `code` ``, `{{ru:…}}` and `- ` bullets; nesting
  (`*give **him***`) can't render and is a validate error.
- Units exist for A2 (20), B1 (20), B2 (15) and C1 (10): `content/units/{a2,b1,b2,c1}-NN.json`, numbered from 1
  per level; `loadUnits()` sorts by level then number. Hand-written unit items live in
  `content/exercises/{b1,b2,c1}-units.json` (ids `ex-b1-u03-02`); B1+ units also reuse `ex-asp-*`/`ex-mot-*`.
  Boss art ids run `boss-01…boss-65`; BossArt has hand-picked looks to 40 and derives the rest from the id.
- Unit drills are data: `{generator, params, count}` from the registry in `src/engine/drills.ts`, or `items`
  ids of hand-written exercises. `src/engine/units.test.ts` checks every unit yields gradable items.
- Stories: one sentence per line `Russian | English`; blank line = new paragraph; dialogues `Speaker: text | en`.
  Write every polysyllabic word stressed; the written stress picks homographs. Words the lexicon lacks are
  problems: rephrase, or add a name/word to closed_class.json (validated). Gerunds and most participles aren't
  in the lexicon. Check `tools/reports/stories.md` for odd context decisions; fix with `{hint}`.
- Session `kind` strings matter: the daily plan ticks steps off by kind (`review`, `lesson`, `checkpoint`,
  `drill-tag-<tag>`, `trainer-<id>`, `arcade`, `crossword`, `speed`, `boss`, `adventure`), and `trainer-<id>` feeds the trainer stats, quest and achievements.
- Trainer content: aspect and motion items live in `content/exercises/{aspect,motion}.json` (ids `ex-asp-*`,
  `ex-mot-*`, type `choice-reason`, with `visual.timeline` / `visual.motion`). Only write a pair where one
  answer is clearly wrong; if both aspects would sound natural, leave the context out.
- «Де́ло» chapters (`content/adventure/ch*.json`) are data: scenes with choices (optionally a graded `check` item)
  or, with `parser: true`, `commands` matched by verb id + object/topic item ids + `requires` flags (first match
  wins, so put the flag-gated command before its fallback). Verbs and items accumulate from earlier chapters
  (later ids win). A verb's `object`/`topic` give case + preposition + `why`, which the parser explains; items
  list their six case forms (names need no `lex`). Flags are shared across chapters.
- Idioms (`content/idioms/idioms.json`, schema `idiom.schema.json`): kind, level, stressed `ru`, `meaning`,
  optional `literal`/`register`/`note`, and at least one example. The practice quiz draws distractor meanings
  from the same kind.
- Placement covers A1–C1 (`PL_LEVELS`); test-out is offered on units below the placed level.
- Cards: rarities gate chests (never a card rarer than the chest). `Profile.cards` holds owned ids; completed
  sets pay `bonusXp` via the service (`awardCard()` for milestone rewards).
- Minimal pairs (`MINIMAL_PAIRS` in trainers.ts) name lexeme + slot; forms come from the lexicon, and a test
  checks each pair differs only in stress. Check homograph order (`n:хлопок` is хлопо́к, `:2` is хло́пок).

## Gotchas

- When writing TS through the Write tool, `\u0301` escapes can end up as literal combining marks. Keep escapes
  explicit in code (`'\u0301'`); a combining mark not following a Cyrillic vowel in `src/**/*.ts(x)` is a bug.
- validate.py also scans string literals and JSX text in `src/**/*.ts(x)` (tests excluded) for the Russian rules.
  Add `// ru-ignore` to a line holding letter sets such as `'аеёиоуыэюя'`. ALL-CAPS abbreviations (ЙЦУКЕН) are
  exempt. A stressed monosyllable carries its clitic group (не́ было, на́ пол).
- Chromium's `scrollIntoView()` now returns a Promise: never return its result from a `useEffect` arrow (React calls
  it as a cleanup). Use a block body.
- Vitest caches transforms in `node_modules/.vitest-cache`: a **new** JSON file under an `import.meta.glob` won't
  appear in tests until you delete that folder.
- String literals that are ids (`'n:книга'`, `'tr:prep:…'`) are skipped by validate's source scan. A prefix
  written as a key needs morpheme notation (`'пере-'`) or it's flagged as unstressed.
- pymorphy3's normal form can differ from the dataset lemma (сча́стье → счастие, де́ньги → деньга, мно́гие →
  многий). `morph.lemma_keys()` covers this in ingest and validate; use it for any new lemma comparison.
- Frequency: an inflecting word is ranked only on evidence from forms unique to it, and only the first homograph
  (dataset order) is ranked. This stops ага́ "cane toad" from inheriting the interjection ага.

## Stack

Vite 8 + React 19 + TypeScript 7 + Tailwind 4, react-router (HashRouter for GitHub Pages), Dexie, ts-fsrs,
vite-plugin-pwa (precaches app + A1–C2 lexicon; X* rare tail cached on first use), Vitest. Fonts: PT Sans / PT Serif via @fontsource (self-hosted).
Palette tokens in `src/index.css` (`paper`, `ink`, `red`, `line`); dark mode via `prefers-color-scheme` or
`<html data-theme>`.

## Working rules (from the brief)

Work in phases; after each: run `npm run check`, commit, update PROGRESS.md, stop for review.
Prefer generating content from data; hand-written Russian must pass validate.py. Never stub features with
"coming soon"; hide what isn't built. Before large writing batches, give the user a size estimate.
