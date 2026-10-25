# Progress

## Status

| Phase | State |
|---|---|
| 0: scaffold, ingestion, validation, schemas | Done |
| 1: shell, storage, PWA, engine, grader, FSRS, rewards | **Done** |
| 2: grammar A2–B1, A2 units, placement, daily plan, vocab SRS, declension lab | Next (needs your go-ahead on the writing budget, below) |

`npm run check` passes:

- 21 Python tool tests;
- `validate.py`: 0 errors and 0 warnings, now also scanning UI source strings;
- typecheck;
- 76 Vitest tests covering the grader, diagnosis, normalisation, transliteration, generators, FSRS, XP, chests,
  streaks, quests, achievements, the rewards service, and backup round-trips.

`npm run build` produces a PWA with 42 precached files.

I tested Phase 1 end to end in headless Chromium:

- a full session through the UI, ending in the chest and the summary;
- Home, Trophies and Settings;
- **offline**: the app reloads and a practice session generates and runs with the network off;
- dark mode;
- no console errors.

## Phase 1: what's built

**Exercise engine.** One `ExerciseItem` format. Renderers for all 11 types: choice, typed cloze, transformation,
word tiles, matching, tap-the-stress, find-the-error, dictation, listen-and-choose, choice-with-reason and
self-graded production. Desktop shortcuts: Enter, 1–4, Space.

**Diagnostic grader** (`src/engine/grader.ts`, `diagnose.ts`):

- Normalisation ignores stress marks, case and punctuation, and treats ё as е. Mixed-layout slips (Latin
  о/а/е inside a Cyrillic word) are repaired.
- Spelling with ё is accepted, with a note that shows the ё.
- One-character typos are forgiven **only inside the stem**. The stem is the part shared by every form of the
  word, so a typo in an ending is never forgiven.
- When an answer is a *real form of the same word in the wrong slot*, the grader names it. Examples:
  - "You used the accusative (шко́лу). Here you need the prepositional: шко́ле. в/на + accusative means motion…"
  - "right case, wrong number"
  - "left in the nominative"
  - animacy, verb person, past-tense gender, adjective agreement
- Spelling-rule detectors: the 7-letter rule (~~книгы~~), я/а after hushers, the 5-letter rule, the soft sign,
  fleeting vowels, and invented endings on a correct stem.
- Distractors carry their own error type and explanation.
- Dictation is diffed word by word.

**Generators** build drills from the verified lexicon: transformation, choice with plausible paradigm
distractors plus a spelling-rule fake, stress (preferring shifting stress), meaning choice, listen-and-choose,
dictation and matching. Missed items come back once later in the session. Audio items are left out if the device
has no Russian voice.

**FSRS** (`src/srs/fsrs.ts`): ts-fsrs with JSON-safe cards. `ratingFor()` maps outcomes to ratings: wrong →
Again; a typo or slow answer → Hard; fast on a mature card → Easy. The vocabulary deck UI is Phase 2.

**Storage** is Dexie. It holds settings, profile, SRS cards and review log, an attempt log, a **learner model**
(EWMA mastery per grammar tag, word, form cell (case × number × gender, for the lab heatmap) and error type),
day totals, quests, achievements, personal bests and sessions. Export/import to one JSON file is atomic and
validated, and there's a double-confirmed reset.

**Rewards** (`src/rewards/`, one service that everything reports to):

- **XP and anti-grind.** XP scales with item type × level × freshness. Freshness comes from FSRS
  retrievability, or from tag mastery for non-SRS items, so a card known cold pays about 15%. Repeating an item
  within 10 minutes pays 0.
- **Combos.** ×2 at 5 in a row, ×3 at 10, ×5 at 20. The meter changes colour, glows at ×5, and the screen edge
  pulses.
- **Sound and touch.** Web Audio sounds: correct answers climb a pentatonic scale with the combo; a wrong answer
  is a soft thud; there are chest arpeggios and a level-up fanfare. Haptic ticks on Android.
- **Visuals.** Particle bursts, floating "+XP", count-ups and smoothly filling bars.
- **Golden questions** (1 in 25, ×5 XP, shimmering card) and a **Счастли́вый час** (12% chance per day on opening
  the app: 15 minutes of double XP).
- **Chests.** A сунду́к after every session of 8+ answers, in four tiers. Odds depend on accuracy and the share
  of hard items, not on volume. Loot: XP, streak freezes, XP boosts, and 6 cosmetic themes (Берёза, Гжель,
  Хохлома́, Па́лех, Бе́лые но́чи).
- **Levels and ranks:** Тури́ст → Студе́нт → Собесе́дник → Знато́к → Писа́тель → Кла́ссик, with a full-screen
  level-up.
- **Streaks:** longest streak kept, freezes used automatically, one freeze earned every 7 days (max 5).
- **Quests:** 3 daily quests, randomised per day with no two on the same metric, plus a weekly challenge.
- **Achievements:** 66 in total, 11 hidden. 51 are active now; 15 belong to unbuilt features and stay invisible.
- **Next goal** always shown ("4 more correct to reach level 5 and become Студе́нт").
- **Session summary** with count-ups, an openable chest and a teaser for the next unlock.
- **Daily reminder:** an `.ics` calendar event (recurring daily) instead of fake notifications.

**Settings:** daily goal, stress marks on/off, theme, animations, transliteration input (with the scheme and
keyboard-layout help), sounds, vibration, TTS voice and speed with a test button (or a help panel for installing
a Russian voice), reminder, export/import/reset.

**PWA:**

- Installable, with a manifest and icons rendered from the SVG bear.
- The app plus the A1–C2 lexicon are precached: about 6.6 MB raw, roughly 1.4 MB gzipped.
- The rare-word tail is cached on first use.
- The UI bundle is 405 KB (131 KB gzipped); pages and lexicon chunks are lazy-loaded.

## Data fixes made during Phase 1

Looking at real sessions exposed a ranking bug: drills offered **ага́ "yep" declined as a noun**. The dataset
has a rare noun ага́ (cane toad / "aga"), and pymorphy3's even split of the frequent interjection ага gave it a
high rank. Similarly, уж "grass snake" was borrowing from уже́. Fixes in `ingest.py`:

1. Inflecting words are ranked only on evidence from forms that belong to them alone. If under 10% of a word's
   mass is unambiguous, its frequency is extrapolated from that evidence.
2. Noun entries can borrow 'other' frequency only when they are really numerals or pronouns.
3. Only the first homograph (dataset order is by frequency) is ranked: пора́ "time to" yes, по́ра "pore" no.

The new levels are A1 598 · A2 887 · B1 1,462 · B2 2,395 · C1 3,203 · C2 3,738. Coverage is now slightly more
conservative: the top 1,000 lemmas cover 73.6% of tokens, and the top 5,000 cover 84.1%. A1 now reads like a
real core list (челове́к, де́ло, вре́мя, день, год, друг…).

The Tatoeba file you uploaded to `main` landed at the repo root as `tools:raw:tatoeba:rus-eng.zip` (GitHub's
uploader flattened the path). I merged `main` and moved it to `tools/raw/tatoeba/rus-eng.zip`: 536,124
Russian–English pairs with per-sentence attribution. I'll ingest it at the start of Phase 2.

## Decisions and trade-offs

- **No placement test yet.** Until it exists (Phase 2), practice draws from the A1+A2 bands.
- **Validator now covers UI code.** Hand-written Russian in UI code (achievement titles, rank names, skins) goes
  through the same stress and ё checks as content. Exemptions:
  - letter sets marked `// ru-ignore`;
  - ALL-CAPS abbreviations;
  - words that inherit stress from a stressed preposition or particle (не́ было, на́ пол).
- **Chest odds depend on quality only.** Long sessions don't buy better chests; a minimum of 8 answers prevents
  micro-session farming.
- **Streaks.** A session of 5+ answers counts for the day. Freezes are spent automatically.
- **Quest rewards.** Each quest pays XP. I dropped the idea of a second "all three quests" chest to keep
  rewards from stacking interruptions.
- **"New cards per day" is hidden** until the vocabulary deck exists (Phase 2), per the "no stubs" rule. The
  same goes for the "download full dictionary" option, which needs the lab.
- **Ghost races, collectible cards and the town** are Phase 5 (games). The reward system has hooks for them:
  personal bests table, feature flags, gated achievements.

## Known issues

- The Phase 0 known issues still stand (morph disagreements report, 9 suspect top-5000 words, unverified short
  adjectives).
- Speech recognition isn't wired up yet (Phase 4).
- Headless Chromium has no Russian voices, so audio exercises were checked by unit tests and manual logic only.
  Please try "Test the voice" in Settings on your phone.

## Content counts

| Content | Count |
|---|---|
| Lexemes | 43,174 (12,283 ranked A1–C2) |
| Example sentence pairs available (Tatoeba, not yet ingested) | 536,124 |
| Error types | 47 |
| Grammar tags | 71 |
| Achievements | 66 (51 active, 11 hidden) |
| Quests | 14 daily, 4 weekly templates (2 daily feature-gated) |
| Themes | 6 |
| Hand-written grammar, units, stories, exercises | 0 (Phase 2+) |

## Review queue (`"review": true`)

None. All Russian written so far (achievement and rank names, UI strings, 19 dictionary overrides) passes
`validate.py`, and I'm confident in it.

## Next: Phase 2, and the spend estimate you asked for

**Code** (moderate):

- Tatoeba sentence ingestion: keep sentences whose words are all verified lexicon forms; add stress from the
  lexicon; drop sentences where stress is ambiguous; store a per-token analysis verified by pymorphy3.
- Cloze generator from real sentences.
- Vocabulary SRS deck and word pages.
- Declension lab and heatmap.
- Placement test engine.
- Daily plan.

**Writing**, the first big batch:

| Content | Size | Output tokens (approx.) |
|---|---|---|
| ~28 A2–B1 grammar articles (why, vs English, tables, spelling rules, memory tricks, common mistakes, 5–10 stressed examples each), plus the case cheat sheet | 1,200–1,800 words each | 70–90k |
| ~20 A2 unit definitions (vocab sets, drill specs, boss names) | mostly data | about 8k |
| About 10 hand-written subtle items per unit (aspect and case nuances generators can't capture) | about 200 items | about 15k |
| About 60 placement-test items, beyond the generated ones | | about 8k |

**Total: roughly 100–120k output tokens of writing**, plus code. If that's more than you want, I can halve the
article length (shorter "why" and "vs English" sections) or write A2 articles now and the B1 ones in Phase 6.
