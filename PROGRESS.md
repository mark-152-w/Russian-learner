# Progress

## Status

| Phase | State |
|---|---|
| 0: scaffold, ingestion, validation, schemas | Done |
| 1: shell, storage, PWA, engine, grader, FSRS, rewards | Done |
| 2: grammar A2–B1, A2 units, placement, daily plan, vocab SRS, declension lab | Done |
| 3: specialist trainers (cases, aspect, motion, stress, numerals) | **Done** |
| 4: graded reader, listening and speaking, keyboard trainer | Next (needs your go-ahead on the writing budget, at the end) |

`npm run check` passes:

- 25 Python tool tests;
- `validate.py`: 0 errors, 2 warnings (сёк in two C1 sentences: a real form pymorphy3 doesn't know);
- typecheck;
- 117 Vitest tests. New in Phase 3: the counting rule and declined numerals, preposition sorting, shifting
  stress and minimal pairs resolved from the lexicon, every hand-written aspect and motion item answerable, and
  the trainer rotation in the daily plan.

`npm run build`: the precache is 126 files, 11.1 MB raw (about 2.9 MB gzipped). The rare-word tail, its search
index and the B2/C1 sentences are cached the first time they're used.

I ran every trainer end to end in headless Chromium with no console errors. That covered the hub, the motion
prefix gallery, the aspect timeline legend, and a run of each mode with its feedback and diagram.

## Phase 3: what's built

A new **Trainers** tab holds five trainers. Each one shows your accuracy from the learner model, per mode.

**Cases** (`/trainer/cases`):

- **Sort the prepositions.** 40 prepositions, each paired with the meaning that fixes its case, so в appears
  as "into (куда́?)" → accusative and as "in (где?)" → prepositional. You tap one of five case bins. Then you
  see the rule with an example: «**без** + genitive: **ко́фе без са́хара**». The list is filtered to your level.
- **Sentence gaps** from Tatoeba, either all cases or one case at a time. The governing word is highlighted and
  a "why this case?" appears after each answer. These come from Phase 2's generator.

**Numbers** (`/trainer/numerals`), all generated:

- **Counting.** The 1 / 2–4 / 5+ rule, including 11–14 and 21/22/25, in 12 everyday frames: prices, the time,
  ages, durations, "there are N people in the room". It knows the special counting forms: два часа́, пять лет,
  пять челове́к. A wrong band gets the rule back ("after 2, 3, 4: genitive singular"), plus the grader's
  diagnosis.
- **Declined numerals.** о́коло двух часо́в, позвони́л пяти́ друзья́м, с тремя́ студе́нтами, о четырёх
  кни́гах. Numeral forms come from `tools/closed_class.json`, so validate.py has checked them against pymorphy3.

**Aspect** (`/trainer/aspect`): **71 hand-written items**, A2–B2. Each has a one-line reason and a **timeline
picture** in the feedback. The pictures cover:

- process, result, repetition, sequence and simultaneous actions;
- duration;
- a bare fact;
- an action undone (приходи́л vs пришёл, брал vs взял);
- request, prohibition and warning (Переда́й соль! / Не закрыва́й! / Не упади́!);
- not managing it.

The modes are past; present, habits and future (за два дня vs два дня); не and нельзя́; imperatives; and fine
points.

**Verbs of motion** (`/trainer/motion`): **63 hand-written items**:

- basics: идти́/ходи́ть, е́хать/е́здить, нести́/носи́ть, вести́/води́ть vs везти́/вози́ть;
- 13 prefixes;
- figurative uses at B2: идёт дождь, тебе́ идёт, вы́шла за́муж, прийти́ в себя́, сойти́ с ума́.

The trainer page has a **prefix gallery**: an animated diagram per prefix, with the on-foot and by-transport
pairs (прийти́ / приходи́ть · прие́хать / приезжа́ть…). The same diagram appears in the feedback.

**Stress** (`/trainer/stress`), all from the lexicon, so the stress is the dataset's:

- shifting noun stress (ру́ку, города́, в лесу́);
- feminine past shifts (жила́, начала́, была́);
- same letters, different form (ру́ки "of the hand" vs руки́ "hands");
- 14 minimal pairs between different words (за́мок/замо́к, пла́чу/плачу́, сто́ит/стои́т, мука́/му́ка…). The
  lexicon must spell both forms identically apart from stress, and a test checks it.

The stress trainer always shows stress marks, even with the stress setting off.

**Rewards:**

- a daily quest, "Finish a trainer session";
- three achievements: Тренажёр, Трудя́га (50 sessions) and Многобо́рец (try all five trainers);
- the daily plan's light item now rotates through the five trainers day by day.

Hand-written aspect and motion items also feed the weak-spot drills and the placement test. That fixes the
Phase 2 issue of the placement aspect questions repeating.

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

**Phase 3**

- **Preposition sorting is a choice item with fixed case bins**, not drag-and-drop. It is faster on a phone, and
  it goes through the same grader, XP and learner model as everything else.
- **The aspect and motion items are hand-written; numerals and stress are generated.** For aspect and motion, I
  left out any context where both aspects (or both verbs) would sound natural to a native speaker, for example
  звони́л/позвони́л ему́, но он не отве́тил. A trainer that marks a natural answer wrong teaches the wrong
  lesson.
- **Minimal pairs come from the lexicon, not from my spelling.** Each pair names two lexemes and slots, and the
  forms are read from the dataset. I dropped two pairs where the dataset was wrong or missing a form
  (а́тлас/атла́с, ду́хи/духи́), and one that turned out not to be a pair: права́ "rights" and права́ "she is
  right" are stressed the same.
- **The hand-written trainer items go one level above yours.** An A2 learner also sees the B1 items, since
  trainers are where you stretch.

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
- The motion diagrams animate with CSS `offset-path`. Safari before 16 (2022) shows them static, which still
  reads correctly.

## Content counts

| Content | Count |
|---|---|
| Lexemes | 43,174 (12,283 ranked A1–C2) |
| Example sentences (verified, stressed, analysed) | 32,430 |
| Grammar articles | 30 (20 A2, 10 B1), about 14k words |
| Course units | 20 (A2), 286 unit words |
| Hand-written exercise items | 226 (84 in units, 8 placement, 71 aspect, 63 motion) |
| Trainer prepositions / minimal pairs | 40 / 14 |
| Error types | 47 |
| Grammar tags | 71 |
| Achievements | 69 (60 active, 11 hidden) |
| Quests | 15 daily, 4 weekly templates |
| Themes | 6 |

## Review queue (`"review": true`)

None. All the hand-written Russian passes `validate.py`, including the dictionary-stress check, and I
re-checked the homographs by hand. Corrections I made along the way, for the record:

- Phase 2: письмо́, де́ньги, о́тдал, приезжа́й, це́ны; по́ездом instead of на по́езде;
- Phase 3: the imperative of переби́ть is **перебе́й** (I'd written переби́й, and pymorphy3 flagged it).
  I rephrased an example to avoid ко́е-что, whose stress dictionaries disagree on.

If anything reads oddly to you, tell me the unit or article and I'll fix it.

## Next: Phase 4, reader, listening and keyboard (estimate)

This is the biggest writing batch so far. Stories are hand-written; a build step adds the per-word analysis
(lemma, case/tense, stress), and validate.py checks it against pymorphy3.

| Piece | Work | Output tokens (approx.) |
|---|---|---|
| Graded reader: tappable words (gloss, dictionary form, analysis, add to SRS), comprehension questions, TTS with sentence highlighting and speed, stress/gloss defaults by level | code | about 12k |
| ~40 original stories A2–C1 with recurring characters, plus short non-fiction (culture, history, everyday life); 250–700 words each, rising with level, with questions and glosses | writing | 70–90k |
| Listening: dictation from the sentence bank (generated), sound discrimination (ы/и, hard/soft, а́канье), shadowing with optional SpeechRecognition | code + small lists | about 10k |
| ~20 short scripted dialogues with questions (two voices where available) | writing | about 15k |
| Keyboard trainer: ЙЦУКЕН course from the home row out, on-screen keyboard, layout setup help | code | about 8k |

**Total: roughly 115–135k output tokens.** If that's too much at once, I'd suggest writing the A2–B1 stories
now (about 20, about 35k) and the B2–C1 ones with the B1–C1 course in Phase 6.
