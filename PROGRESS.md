# Progress

## Status

| Phase | State |
|---|---|
| 0: scaffold, ingestion, validation, schemas | Done |
| 1: shell, storage, PWA, engine, grader, FSRS, rewards | Done |
| 2: grammar A2–B1, A2 units, placement, daily plan, vocab SRS, declension lab | **Done** |
| 3: specialist trainers (cases, aspect, motion, stress, numerals) | Next (estimate at the end) |

`npm run check` passes:

- 25 Python tool tests;
- `validate.py`: 0 errors, 2 warnings (сёк in two C1 sentences: a real form pymorphy3 doesn't know);
- typecheck;
- 105 Vitest tests. New in Phase 2: sentence cloze and generators, every unit producing gradable items,
  placement staircase and item bank, the vocabulary deck, and the daily plan.

`npm run build`: the precache is 123 files, 11.3 MB raw (about 2.9 MB gzipped). That covers the app, the A1–C2
lexicon and the A1–B1 example sentences. The rare-word tail, its search index and the B2/C1 sentences are cached
the first time they're used.

I ran an end-to-end check in headless Chromium with no console errors. It covered:

- Home with the daily plan;
- the whole placement test through to the result;
- the course, a unit and a lesson;
- the grammar index and an article;
- the stress sprint;
- the Lab, word pages and Review (checked earlier in the phase).

## Phase 2: what's built

**Example sentences** (`tools/sentences.py`). From Tatoeba's 536k Russian–English pairs, I kept **32,430**
sentences:

| Level | Sentences |
|---|---|
| A1 | 2,594 |
| A2 | 4,218 |
| B1 | 6,736 |
| B2 | 9,633 |
| C1 | 9,249 |

A sentence is kept only when:

- every word resolves to a verified lexicon form, or to a closed-class word in `tools/closed_class.json`
  (pronouns, numerals, names, preposition variants such as во/со/обо);
- the stress is unambiguous in context.

Each word stores its lexeme and slot, so stress is added from the dictionary and cloze gaps know exactly what
they test. Stress marks already in the source text are stripped, which fixed doubled marks like му́ка́. A
sentence's level is the rank of its rarest word. Each lexeme is capped at 6 examples so common words don't
crowd out the rest. Every sentence links back to Tatoeba (CC BY 2.0 FR).

**Generators from real sentences** (`src/engine/sentenceGen.ts`, `drills.ts`):

- **Case cloze** with the governing word in bold and a "why this case?" reason: «**в** + prepositional: location»,
  «**нет** + genitive», «after **два/три/четы́ре**: genitive singular».
- **Verb cloze.**
- **Find the error:** a real form planted in the wrong case, same number.
- **Word tiles.**
- **Declension-pattern drills.**

A drill registry (`case-cloze`, `verb-cloze`, `forms`, `pattern`, `vocab`, `stress`, `match`, `find-error`,
`tiles`) lets units declare drills as data. `itemsForTag()` builds a focused drill for any grammar tag.

**Vocabulary SRS** (`/review`, `src/srs/deck.ts`):

- Each word gets cards in several directions: ru→en, en→ru, audio (when a Russian voice exists) and sentence
  cloze, staggered over a few days.
- A form you miss in any session becomes its own **form card** (e.g. «рука́ → accusative singular»).
- There's a daily new-word limit (setting) and a queue fed by unit word lists.
- Words more frequent than your known rank are skipped.
- Function words (prepositions, conjunctions, particles) aren't made into cards; they're learned through the
  grammar.

**Declension and conjugation lab** (`/lab`, `/word/:id`):

- Search by lemma, English, or **any inflected form** (книгами → кни́га).
- Full stressed tables with highlighted endings, filter chips (case, number, tense) and rare/unverified marks.
- Word pages show:
  - Tatoeba examples;
  - your deck state and history;
  - "Drill this word" and "Drill this pattern" buttons (e.g. all feminine -а nouns in the instrumental plural).
- A case × number × gender accuracy heatmap where each cell launches a drill.
- Settings → "Download the full dictionary" caches the rare tail for offline lookup.

**Grammar reference** (`/grammar`): 30 articles, 20 at A2 and 10 at B1, plus a case cheat sheet. Each has:

- a summary card;
- why it works this way;
- how it differs from English;
- tables, some generated live from the lexicon so they're never wrong;
- spelling rules and memory tricks;
- common mistakes, each with its error type;
- 5–10 stressed examples;
- related articles.

**A2 course** (`/course`): 20 units of 286 hand-picked words, each with:

- grammar cards;
- a lesson that interleaves its drills, with 92 hand-written items for the nuances generators can't capture
  (aspect choices, case subtleties);
- a 15-item checkpoint. 80% completes the unit, and the "units" achievements track it.

Units below your placed level offer **test-out**.

**Placement test** (`/placement`, linked from the course page and Settings):

- About 25 questions in five interleaved staircases: case endings, verb forms, aspect, vocabulary and reading.
- Each staircase starts at A2: a right answer moves it up a level, a wrong one moves it down.
- A skill's level is the highest level where you got at least as many right as wrong.
- Your overall level is the median of the five.
- The result sets test-out on the course page and the known-word rank (150 / 600 / 1,500 / 3,000 for vocabulary
  A1–B2).

**Daily plan** (Home), a checklist that ticks itself off as sessions finish:

1. Due reviews, or new words when nothing is due.
2. The next course step (the lesson, then its checkpoint).
3. **Your weakest grammar topic** from the learner model. It has to have 6+ attempts and be under 75%; it then
   links to a focused drill of exactly that topic.
4. A stress sprint as the light item.

Home also shows **"You know about N words: enough to recognise roughly X% of the words in everyday spoken
Russian"**. It's computed honestly from the subtitle frequency curve and highlights each milestone (100, 250,
500, 1,000…) once.

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

**Phase 2**

- **Descriptive declension labels.** Patterns are named by their endings ("feminine -а/-я nouns", "masculine
  hard-stem nouns") rather than by school numbering (1st/2nd/3rd declension). Russian and Western textbooks
  number them differently, and the descriptive names say what you need to know.
- **Sentence selection: correctness over quantity.** About 6% of Tatoeba survives the filter. Dropping a
  sentence costs little; a wrong stress mark taught as correct costs a lot.
- **Names are linked only to proper-noun lexemes.** Earlier, Том was linked to том "volume".
- **Grammar articles came out shorter than estimated.** They total about 14k words of prose against the 35–50k I
  estimated. I wrote them to be concise: one idea per section, tables instead of paragraphs. Every article
  still has all the sections from the brief, and the generated tables carry much of the load. If you'd like
  longer "why" sections, that's an easy follow-up.
- **The placement test favours quick choices over typing.** The goal is a level, not a grade. It gives no XP
  and doesn't touch the learner model.
- **Known-word credit.** The most frequent words (150 by default, or more after placement) aren't introduced
  as cards and count towards the "you know N words" figure. Without this, an A2 learner would be shown
  я / не / ты as new words.
- **The rare-word search index isn't precached.** It's 2.7 MB and is only needed after "download the full
  dictionary".
- **The validator now also catches** wrong stress compared with the dictionary (руку́, сто́ле), compounds
  (Ба́ба-Яга́), clitic groups (не́ было) and markdown emphasis the renderer can't display. It can't tell
  homographs apart (це́ны "prices" vs цены́ is fine either way), so I checked those by hand.

**Phase 1** (unchanged):

- Chest odds depend on quality only, with a minimum of 8 answers.
- A session of 5+ answers counts for the streak.
- Quests pay XP rather than a second chest.
- Ghost races, collectible cards and the town are Phase 5.

## Known issues

- The Phase 0 known issues still stand (morph disagreements report, 9 suspect top-5000 words, unverified short
  adjectives).
- Headless Chromium has no Russian voices, so audio cards and listen items were verified by tests only. Please
  try a review session on your phone.
- Tatoeba translations are community-written; a few English glosses are loose. Each sentence links to its
  source page.
- The placement test's aspect skill draws from 8 hand-written items plus the units' aspect items, so retaking
  it soon repeats questions. The Phase 3 aspect trainer will add more.

## Content counts

| Content | Count |
|---|---|
| Lexemes | 43,174 (12,283 ranked A1–C2) |
| Example sentences (verified, stressed, analysed) | 32,430 |
| Grammar articles | 30 (20 A2, 10 B1), about 14k words |
| Course units | 20 (A2), 286 unit words |
| Hand-written exercise items | 92 (84 in units, 8 placement) |
| Error types | 47 |
| Grammar tags | 71 |
| Achievements | 66 (57 active, 11 hidden) |
| Quests | 14 daily, 4 weekly templates |
| Themes | 6 |

## Review queue (`"review": true`)

None. All the hand-written Russian passes `validate.py`, including the dictionary-stress check, and I
re-checked the homographs by hand. Corrections I made along the way, for the record:

- письмо́, де́ньги, о́тдал, приезжа́й, це́ны;
- по́ездом instead of на по́езде in a "how did you get here" example.

If anything reads oddly to you, tell me the unit or article and I'll fix it.

## Next: Phase 3, specialist trainers (estimate)

Mostly code. The writing is small because most items come from the sentence bank.

| Piece | Work | Output tokens (approx.) |
|---|---|---|
| Cases trainer: preposition→case sorting game, governing-word highlight (exists), "why" for every item | code | about 8k |
| Numerals trainer: 2/3/4 + gen sg, 5+ gen pl, declined numerals, prices and times; all generated | code | about 6k |
| Aspect trainer: ~80 hand-written contextual pairs with one-line reasons, plus negation and imperatives; process vs result timeline graphic | writing + code | about 15k |
| Verbs of motion: uni/multi-directional, on foot/by vehicle; 13 prefixes, each with an animated SVG direction diagram; ~60 items, figurative uses at B2 | writing + code | about 15k |
| Stress trainer: shifting patterns, feminine past (жила́), minimal pairs (за́мок / замо́к); generated, plus a ~30-pair list | code + small list | about 5k |

**Total: roughly 50k output tokens**, about half of Phase 2's budget.
