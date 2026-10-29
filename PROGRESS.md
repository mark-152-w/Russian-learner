# Progress

## Status

| Phase | State |
|---|---|
| 0: scaffold, ingestion, validation, schemas | Done |
| 1: shell, storage, PWA, engine, grader, FSRS, rewards | Done |
| 2: grammar A2–B1, A2 units, placement, daily plan, vocab SRS, declension lab | Done |
| 3: specialist trainers (cases, aspect, motion, stress, numerals) | Done |
| 4: graded reader, listening and speaking, keyboard trainer | **Done** (all 40 stories, not just the first 15) |
| 5: games, collectible cards, the town, text adventure «Де́ло» | **Done** (in four chunks) |
| 6: B1–C1 units, remaining grammar articles, idioms/culture | **Done** (in four chunks) |
| 7: stats dashboard, polish, accessibility, performance, GitHub Pages deploy | **Done** |
| 8: retention (memory research applied to the existing app) | Parts 1–3 **done**: varied cloze sentences, relearning, fading grammar mastery; leech rescue with memory hooks, confusion-pair cards; word families, guessing first, the evening review, a forgetting curve fitted to you |

`npm run check` passes:

- 25 Python tool tests;
- `validate.py`: 0 errors, 2 warnings (сёк in two C1 sentences: a real form pymorphy3 doesn't know);
- typecheck;
- 189 Vitest tests (5 added with the A1 unit: the next-unit rule, beginner stress items). New in Phase 8 part 3: the memory-strength fit recovers a simulated learner's strength; the
  retention correction keeps the learner's target; review logs replay into observations; binned recall for the
  chart; word guesses (sentence, relative hint, only a new word's first card); a wrong guess costs nothing; every
  unit with grammar yields three gradable guesses; guess sessions never retry; the evening plan step. Part 2: pair items in both directions; what counts as a mix-up (a deck word's meaning
  or form, never a form of the word asked); the pair card on the second mix-up; leech thresholds and hooks; the cloze card rotates sentences; the relearning queue (gap, cap, the
  default once-only rule); grammar mastery fading by time, and the plan's refresh step. New after Phase 7: the update-prompt store (`src/lib/pwa.ts`). New in Phase 7: the stats calculations (calendar, weekly XP, accuracy by case) and the
  meaning-distractor overlap rule. New in Phase 6:
  - all 65 units, at every level, produce gradable items from every drill, in course order;
  - placement recovers every level from A1 to C1;
  - every idiom makes a four-way meaning question that grades.

  New in Phase 5:
  - the preposition joining rule (о → об, с → со…);
  - every arcade wave deals valid gradable cards;
  - every crossword topic builds a consistent grid, and the daily puzzle is deterministic;
  - boss damage, hearts, and revenge items from recent mistakes;
  - speed match never deals a word twice and never gives the newcomer away;
  - the card index matches the set files, and every blurb word is analysed;
  - chests never deal a card rarer than the chest;
  - town levels and ranks;
  - every adventure link resolves, every gate grades, and the parser plays chapters 3–5 and explains wrong cases
    and prepositions.
  New in Phase 4:
  - every story word carries an analysis and every comprehension question is answerable;
  - analysis labels;
  - а́канье;
  - the dictation, shadowing and sound-pair items grade their own answers;
  - each keyboard lesson uses only learned letters.

`npm run build`: the precache is 291 files (221 after Phase 5), 12.4 MB raw (about 3.2 MB gzipped), with the stories loaded one file at a time.

I ran end-to-end checks in headless Chromium at phone width, with no console errors. In Phase 5 they covered:
the games hub; an arcade run, a speed round and a crossword; a boss fight to the end; the town; the collection and
a card's tappable text; «Де́ло» chapter 1 by choices, a chapter 2 grammar gate, and chapter 3 by typed commands,
including wrong cases. In Phase 4 they covered:

- the daily plan's new reading step;
- the library;
- a story: tapping a word, the English toggle, and the questions;
- a C1 text, where stress marks and glosses are off by default;
- the Listening page and a dialogue;
- the keyboard: typing a lesson line with Latin key positions;
- the new Practice and Reference hubs.

## A1 unit 1: Hello! First words (after Phase 8)

A first unit for complete beginners, before A2 unit 1 (`content/units/a1-01.json`, boss Колобо́к).

- **Rule** (`g-first-steps`): the alphabet in four groups (old friends, false friends, new letters, the two signs),
  each letter with its sound and an example word; the **РЕСТОРАН** trick; stress and unstressed о; **э́то** with no
  *a/the/is*; **кто / что / где**, yes/no questions by intonation, **нет** vs **не**; a greetings table; **ты / вы**;
  common mistakes.
- **Exercises** (`content/exercises/a1-u01.json`, 19 items): reading cognates (**такси́**, **рестора́н**,
  **футбо́л**…), greetings and register, **меня́ зову́т**, question words, **нет / не**, no *is*.
- **Generated drills**: 25 words (greetings, polite words, question words, family, everyday things), with vocab,
  match, and stress on the dictionary form only (new `dictionary` param on the stress generator: no case forms
  before cases are taught).
- Three new tags (`basics.alphabet`, `basics.this-is`, `basics.greetings`).
- **The next unit** no longer sends a learner back to a level they went straight past: someone halfway through A2
  isn't told to do A1 unit 1 now (it stays open in the course list). A level they've started still brings them back
  to a unit they skipped.

## Phase 8: what's built (part 3)

Four more features from memory research.

**Word families** (*depth of processing*, Craik & Lockhart). 107 hand-written root families, 639 words
(`src/data/content/roots/roots.json`, schema `root.schema.json`): the root with its alternants (пис-, пиш-), what
it means, the words built on it, and for 32 of them a short note where the link is a surprise. Examples:
- **неде́ля** was the day of *not doing*;
- **включи́ть** is to *lock in*;
- **друг**, **друго́й** and **вдруг** share a root.

I checked every note's etymology and rewrote two loose ones. validate.py checks that every member exists and that
no word sits in two families. 12 members are rare words from the extended dictionary. A word's page shows its
family: each relative is linked, with its meaning and a ✓ if you know it. The rescue screen shows the family too.

**Guessing before you're told** (*the pretesting effect*, Kornell & Richland).
- **New words.** A new word's first card is a guess: the word underlined in a real sentence, plus a hint from its
  family ("Related to писа́ть (write)", preferring a relative you're already learning). Pick a meaning. A wrong
  guess shows **Now you know** in neutral colours: no thud, no XP, and it doesn't break the combo or count as a
  mistake. The answer and the sentence's translation follow, and the word then comes back as a real question
  ("What does it mean?"). There's no guess without a sentence or a relative, since guessing from nothing teaches
  nothing.
- **Grammar.** On a unit you haven't started, the rule stays folded behind **Guess first**: three of the unit's own
  grammar questions before you read it, or **Show me the rule** to skip. Guesses never retry (there's nothing to
  retrieve yet), and the summary sends you to **Read the rule**. A test checks that all 65 units with grammar yield
  three gradable guesses.
- Exercise items have a new `pretest` flag (schema): a wrong answer to one costs nothing in the reward service.

**Evening review** (*sleep consolidation*; Mazza et al. 2016). From 7 pm, a day with 3 or more new words adds
**Evening review: today's N new words** to the plan (`/review/evening`). It's recall in both directions, missed
words relearned until right, and it never moves a card's schedule. It ticks off like the other steps (kind
`evening`).

**A forgetting curve fitted to you** (`src/srs/memory.ts`).
- **The fit.** The review log is replayed through FSRS. Every review of a learned card at least a day after the
  last one is an observation: elapsed days, FSRS's stability, and whether it was recalled. A maximum-likelihood
  fit finds one number, your memory strength *k* relative to FSRS's average learner. A prior keeps it near 1
  until the evidence says otherwise. It refits in the background after every review session. On simulated
  learners it recovers k = 1.6 and k = 0.7 within ±0.15.
- **Using it.** Once there are 30 observations, the scheduler requests the retention that makes *your* actual
  retention equal your target: r′ = (1 + k·(target^(1/decay) − 1))^decay. A test checks that the corrected
  interval lands exactly on the target for a learner of strength k.
- **Settings → Remember** (80–95%, default 90%) shows what each target costs in reviews a day for your deck.
- **Stats → Your forgetting curve** compares your curve with the average learner's for your typical learned card,
  with your actual recall as dots. Hover or tap reads both curves at a day, and there's a table view. It uses the
  emphasis pattern: you in the accent colour, the average as a grey context line, both labelled at their ends. The
  y-range fits the data.

I checked it in headless Chromium at phone width, with a fixed 8 pm clock:
- New words: a new word's first card was a guess, and wrong guesses showed "Now you know" and came back as real
  questions.
- The fit: a simulated 1.3× learner (532 reviews, through the app's own scheduler) was fitted at k = 1.26, and the
  Stats chart rendered.
- Settings showed workloads.
- Evening: the evening step appeared, ran, and ticked off.
- Units: a fresh unit's guess-first ran three guesses, then showed the rule.

There were no console errors. axe-core found no violations on the Word page, Stats (light and dark) or the unit
page.

## Phase 8: what's built (part 2)

Two features for the words that won't stick, both from the learner's own mistakes.

**Leech rescue** (*keyword mnemonics*, Atkinson 1975; the *generation effect*). A word whose vocabulary cards
have lapsed 5 times in total (forgotten after being learned) is a leech. Before a Review session, up to 3 due
leeches get a **Word rescue** screen:
- the word with audio, its meanings and an example sentence;
- the words it's mixed up with, if any;
- a box for **your own memory hook**, with short tips on making one (sound-alike + vivid picture: щека́ sounds like
  "check-a").

Saving or skipping both count as offered, so it doesn't nag: it's offered again only after 4 more lapses. From
then on, **your hook shows in the feedback whenever you miss that word**, in any session, not only Review. The
Word page has a hook editor too, so you can add one to any word, and shows how often you've forgotten it.
(`src/srs/leech.ts`, `src/components/LeechRescue.tsx`.)

**Confusion pairs** (*interference*). A wrong answer counts as a mix-up when it's another word *from your own
deck*: you picked its meaning, or typed one of its forms. A word outside the deck doesn't count, since picking
one of those is a guess rather than interference. A real form of the word asked for doesn't count either: that's
a grammar slip (ста́ли is a form of both сталь and стать). On the second mix-up between the same two words, at
least an hour after the first (a relearning retry repeating the same slip is one occasion), a **pair card** joins
the deck. It alternates which word it asks about and the direction ("Which word means
*dress*? пла́тье / плати́ть", "плати́ть: which meaning?"), and the feedback always contrasts the two:
**пла́тье** means *dress*; **плати́ть** means *pay*. Words whose glosses overlap get no card, since they can't
be told apart that way. The Word page lists "Often mixed up with пла́тье (2×)". (`src/srs/confusion.ts`,
`pairItem` in `generators.ts`.)

**Storage.** Hooks, mix-up counts and rescue offers are rows in the existing `kv` table (`hook:<lex>`,
`confuse:<a>|<b>`, `rescue:<lex>`), so there's no database migration and backups already include them. Pair
cards are ordinary FSRS cards (`kind: 'pair'`, with `other`). The Word page's "In your deck / Known" ignores
them.

I checked it in headless Chromium at phone width, with a seeded leech (книга, 6 lapses) and a seeded mix-up
(плати́ть/пла́тье). The rescue screen showed and saved the hook. The hook appeared under every missed книга
card: sentence gap, typed and meaning. The pair card came up with its contrast line, and the Word page showed
the hook and the mix-up. There were no console errors, and axe-core found no violations on the rescue screen or
the Word page, in light and dark mode.

## Phase 8: what's built (part 1)

Three changes from memory research, applied to what the app already does. Nothing new to learn in the UI; the
existing sessions just work better.

**A different sentence on each review** (*encoding variability*: a word met in varied contexts is recalled
better in new ones). A word's sentence-gap card now rotates through up to 8 sentences, one per review
(`card.reps`), in `cardToItem` (`src/srs/deck.ts`). This also fixed a quiet bug: the card used to try only the
4 shortest example sentences. For nouns and adjectives those are usually in the nominative, which can't be
gapped, so the card fell back to a plain English→Russian card. книга and новый never got a sentence card; now
they do.

**Relearning until correct** (*successive relearning*, Rawson & Dunlosky). In Review, a missed card comes back
3 items later, and again after each miss, until it's answered correctly, up to 3 retries
(`src/lib/relearn.ts`; `SessionRunner relearn="until-correct"`). Other sessions keep the old rule: a missed item
comes back once, at the end. A retry reshuffles its options, so you can't just remember "it was the second
button". Every retry goes through FSRS like any review, so a word relearned in-session leaves Relearning the
normal way.

**Grammar mastery fades** (*the forgetting curve*). The learner model stores recent accuracy per topic. It
never went down with time, so a topic mastered in unit 3 looked mastered forever and never came back.
`recallScore()` (`src/lib/forgetting.ts`) now discounts the score by the days since the topic was last
practised. The half-life is 30 days at 10 attempts and grows with the square root of practice (20–180 days).
A topic at 95% with 10 attempts comes back after about 10 days; with 60 attempts, after about 3½ weeks; each
refresh pushes the next one further out. The stored score is untouched; the fading is applied when it's read.
- The daily plan's weak-spot step uses the faded score. A topic that was strong but has gone stale shows as
  **Refresh: Genitive · Last practised 30 days ago**; a genuinely weak one still says **Weak spot**.
- XP freshness uses it too, so refreshing a stale topic pays like real work.
- Stats, the trainer bars and the Word page still show plain accuracy. That's what they describe.

I checked it in headless Chromium at phone width: in a Review session, a missed card came back at items 4, 8
and 12 with its options in a new order each time, then stopped. There were no console errors.

## Clean-up pass after Phase 7

A review for errors and inefficiencies. Fixes:

- **Update banner.** The service-worker events now go through a small store (`src/lib/pwa.ts`), so an update
  that arrives mid-lesson is still offered afterwards. "Later" hides only that update. Installed copies check
  for a new version hourly while online. A loop that re-fired the "ready to work offline" toast (and starved
  page navigation once the service worker was active) was caught before release.
- **Page titles and focus.** The screen-reader `<h1>` tracks the page content (a MutationObserver). Focus moves
  to `<main>` only when it would otherwise be lost, not away from a field the learner is using.
- **Voice detection.** It starts at app start-up and its result is kept for the visit. Session pages on devices
  without a Russian voice used to wait 1.5 s each; Review now opens in about 0.3 s, down from 1.8 s (4× CPU throttle).
- **Unit drills.** Splitting the sentence bank by the unit's words is computed once per lesson, not per drill:
  a C1 boss opens in 0.5 s, down from 0.9 s. Meaning distractors are sampled rather than found by scanning the whole pool.
- **Stats** reads only the tag/form/error rows of the learner model (not one row per word), and shares the
  "weakest topic" rule with the daily plan (`weakTags`). Calendar days use the same day key as streaks.
- **Smaller fixes:**
  - grammar tables have distinct accessible labels;
  - the Home shortcut grid no longer leaves a gap when a feature is hidden;
  - Attributions dropped a stale snapshot line.

## Phase 7: what's built

**Stats** (`/stats`, linked from Home and Trophies):
- totals: time practised, answers, accuracy, longest streak, words known;
- an activity calendar for the last 18 weeks;
- XP per week for the last 12 weeks;
- accuracy by case, from every form you've answered;
- your weakest topics (each links to a drill) and your most common mistake types.

Everything is computed from the per-day totals and the learner model, by pure functions in
`src/lib/statsData.ts`. The charts follow one-hue, thin-mark, label-in-ink rules. Hover or tap shows the
value, and the case accuracies are a real table.

**Accessibility.** axe-core reports **zero violations** on 19 pages, in both light and dark mode. Fixes:
- every progress bar has an accessible name;
- contrast: the light-mode green is darker; the dark-mode red is lighter; the gold badges use dark text; locked
  adventure chapters are dashed instead of faded;
- every page has a browser-tab title, and a heading for screen readers where it had none;
- focus moves to the page on navigation;
- wide grammar tables are keyboard-scrollable regions.

**Updates and offline.** The app used to update itself silently, which could reload it in the middle of a
lesson. Now a new version shows **A new version is ready · Later / Update**, and never during a session.
Installed copies check for updates hourly, and the first visit says when the app is ready to work offline.

**Performance.** The startup JavaScript is about 170 KB gzipped: React, the router, the database and the
scheduler. Every page and data file loads on demand. The 12 MB offline precache (the whole dictionary and
sentence bank) downloads in the background after the first visit. I tried swapping in react-router's
production build; it saved under 1 KB after minification, so I left the configuration alone.

**Polish**:
- Home's shortcut tiles fit at phone width, and the Settings placement button no longer wraps.
- Meaning questions no longer offer a distractor that contains the answer (*first* against *first-class*).

**Deploy and credits.** Every merge to `main` has deployed to GitHub Pages, starting with the first one (Phases 0–2)
(https://mark-152-w.github.io/Russian-learner/). The README now explains the site, installing it, and where
your data lives. The Attributions page was missing Tatoeba: `sources.json` still called it unreachable, a note
from Phase 0. It's now credited with its licence, like the other sources: the page reads `tools/sources.json` directly, so a
credit never waits for a dictionary rebuild.

## Phase 6: what's built

The course now runs from A2 to C1, and the reference section covers every level.

**B1 course** (20 units). Work, health, travel, getting around town, shopping, weather, instructions, plans and
dreams, describing people, home, money, habits, feelings, the kitchen, studying, news, holidays, sport,
relationships, and a review. Each unit:
- builds on one or two of the existing B1 articles (reflexive verbs, impersonal sentences, prefixed motion,
  comparatives, imperatives, the conditional, кото́рый, plural declension, numerals, aspect);
- has about 14 themed words, generated drills (case and verb cloze, forms, comparatives, patterns, find the
  error, word tiles), and the aspect and motion trainer items where they fit;
- has three new hand-written items for what generators can't do: е́сли бы, кото́рую versus кото́рая,
  нельзя́ переходи́ть, жени́ться на, скуча́ть по…;
- has a boss: Кот-Баю́н, Руса́лка, Хозя́йка Ме́дной горы́, Тарака́нище, Кот Бегемо́т, Медве́дь-воево́да and others.

**B2/C1 grammar** (20 articles). B2: active and passive participles, gerunds, reported speech, что́бы, свой,
verbs and their cases, figurative motion, word order, linking words. C1: word formation, diminutives,
register, the subtle uses of aspect, collective numerals and approximation (лет пять), the passive,
indefinite and negative pronouns (кто́-то, кто́-нибудь, никто́ не, не́кого), stress patterns, bookish
prepositions (благодаря́, вопреки́, в связи́ с), and advanced impersonal constructions (мне не спи́тся, доро́гу
занесло́ сне́гом). Each has the usual card, tables, an English comparison, common mistakes and examples.

**B2 and C1 courses** (15 + 10 units). One unit per new article, each with a theme (science with
participles, history with the passive, the law with bookish prepositions, poetry with stress…), themed
vocabulary, generated drills and two or three hand-written items, plus 25 more bosses.

**Idioms and culture** (`/idioms`, linked from Reference). There are 77 entries:
- 46 idioms and proverbs, 8 everyday phrases, 4 slang words, 10 etiquette phrases and 8 customs, plus блин
  explained;
- each has its meaning, a literal translation, a register label, a note where it helps, and an example;
- you can filter by kind, search in either language, and listen;
- **Practise 10 meanings** runs a normal session (XP, combos, the learner model).

**Elsewhere**:
- Units sort by level, then number, and labels name the level ("B1 unit 3").
- The placement test now reaches C1, so learners placed at B2 or C1 can test out of lower-level units.
- Boss portraits beyond the hand-designed 40 get a stable look derived from their id.
- New achievements: B1, B2 and C1 complete; Кра́сное словцо́ (50 idiom meanings).
- New error types: comparative needed, superlative needed, wrong conjunction.
- New tags: indefinite and negative pronouns.
- The town's school and fortress thresholds are rescaled for 65 units and bosses.

## Phase 5: what's built

Both games live under **Practice → Games** (`/games`), and the daily plan's "something fun" step now rotates
through them too.

**Case arcade** (`/arcade`, `src/engine/arcade.ts`). A card falls with a governing word and a noun in the
dictionary form (без + кни́га); pick the right form from three before it lands. Waves of eight cards get faster
(9 s down to 3.2 s) and widen: genitive/dative/accusative, then all five cases, then plurals, then adjective +
noun phrases, then numbers (2 кни́ги, 5 книг). в/на carry a «где?» or «куда́?» cue so the case is decidable, and
the preposition adapts to the word (об о́кнах, со столо́м, во вто́рник). Three lives; points are 10 × wave plus a
speed bonus. A wrong answer shows the rule (**без** + genitive: **без кни́ги**). Every card is a normal graded
item with a lexeme target, so misses feed the learner model and the diagnosis like any drill. The top ten runs
are kept as personal bests. With reduced motion on, cards fall 3 s slower.

**Declension crossword** (`/crossword`, `src/engine/crossword.ts`). Every answer is an inflected form from the
lexicon at your level: the clue gives the dictionary form or the English meaning plus the form wanted
(«кни́га — gen. pl.», «"choose" — ты …»). A generator places 6–10 words on a grid where they cross. There is a
daily puzzle (the same for everyone on a given day) and puzzles by topic: mixed, each case, plurals, verb
forms. Type with any keyboard, including Latin key positions; tap a cell twice to switch direction; Check marks
wrong letters; Reveal fills a word (a revealed word doesn't count as correct). Stress doesn't matter and ё = е.

**Rewards**: two new session kinds (`arcade`, `crossword`), feature flags `arcade` and `crossword`, and three
new achievements: Разга́дчик (10 crosswords), Ме́ткость (500 arcade points), Чемпио́н (2,000). The boss
achievements now wait for the `bosses` flag (chunk 2).

**Speed match** (`/speed`, `src/engine/speed.ts`). Five Russian words, five meanings, one minute. Each match
deals a new word, and its meaning is swapped into a random slot so the newcomer isn't obvious. Runs of matches
score more, and a wrong pair costs three seconds. Every attempted pair is a graded meaning item for the learner model.

**Boss battles** (`/boss/:unit`, `src/engine/boss.ts`). Every A2 unit has the boss its JSON always named: Домово́й,
Ле́ший, Ба́ба-Яга́, Змей Горы́ныч, up to Царь-Медве́дь. The 20 SVG portraits are drawn from shared parts, one line of
data each. A boss has HP; every right answer hits it, a run of three hits twice as hard, and each mistake costs
one of three hearts. The questions are the unit's checkpoint drills plus "revenge" items: forms you got wrong
anywhere in the app in the last two weeks. The boss shows on its unit page and in the games hub. A first win
counts for Пе́рвая побе́да / Богаты́рь and earns a card. The session runner gained two small hooks (`hud`,
`onAnswered`), so bosses reuse every exercise type.

**Collectible cards** (`/cards`, `/card/:id`). There are 32 cards in four sets: people (Пу́шкин, Гага́рин,
Терешко́ва…), places (Байка́л, Камча́тка, Эрмита́ж…), idioms (Ни пу́ха ни пера́!, Ве́шать лапшу́ на у́ши…) and culture
(ба́ня, Ма́сленица, Гжель…). Each card has a two- or three-sentence text, written in `tools/cards/*.txt` and built
by the story pipeline. Every word in it is analysed and tappable, like a story.
- Cards come from chests: a better chest can hold a rarer card, and never one rarer than the chest. They're also
  milestone rewards: a boss's first defeat, a completed unit, a finished adventure chapter.
- A full set pays bonus XP.
- `src/data/cards-index.json` holds names and rarities only, so chests don't load the texts.

**The town** (`/town`, linked from Home). Ten buildings, each growing through five levels with one part of your
learning:
- Дом (longest streak), По́чта (reviews), Ры́нок (words known), Шко́ла (units);
- Библиоте́ка (stories), Теа́тр (dictations), Вокза́л (trainer sessions), Стадио́н (games);
- Кре́пость (bosses), Музе́й (cards).

An empty plot is something you haven't tried yet. The town's rank climbs from Ху́тор to Столи́ца.

**«Де́ло»** (`/adventure`, `src/engine/adventure.ts`, `content/adventure/ch1–5.json`). The town museum's
200-year-old samovar has vanished, and you're the detective.
- Chapters 1–2 (A2) are choices. Three of them only open once you pick the right form («Покажи́те биле́т Ни́не»).
- Chapters 3–5 (B1) take typed commands: иди́, возьми́, осмотри́, откро́й, then спроси́ о…, поговори́ с…, покажи́…
  кому́, поста́вь на…, отда́й… кому́.
- The parser reads each verb's case and preposition from the chapter data. It explains a mistake in grammar
  terms: «возьми́ ключа́» → take *what?*: the accusative, **возьми́ ключ**; «иди́ в сара́е» → *where to?*: в +
  accusative. Good Russian that just doesn't apply gets "Your Russian is fine, but nothing happens".
- Every grammar decision is reported to the learner model under the matching tag. A first finish of a chapter
  earns an epic-or-lower card.
- There are two endings.

**Rewards**:
- new session kinds: `speed`, `boss`, `adventure`;
- feature flags: `speed`, `bosses`, `cards`, `town`, `adventure`;
- new achievements: Скорогово́рка (25 pairs in a round), Храни́тель (all 32 cards, hidden), Градострои́тель (25
  building levels), Де́ло закры́то (all five chapters);
- the daily plan's light step now also rotates through speed match and «Де́ло».

## Phase 4: what's built

**Story pipeline** (`tools/stories.py`). I write a story as plain stressed Russian, one sentence per line, each
followed by its English. The tool tokenises it and gives every word its lexeme, stressed lemma and grammatical
analysis. `validate.py` then checks each analysis against pymorphy3, so nothing is guessed at runtime.

Where several analyses fit a word, it decides in this order:

1. The written stress (за́мок / замо́к, ру́ки / руки́).
2. Inline hints, for the rare cases rules can't settle: `ва́нной{n:ванная}`.
3. Preposition government, which carries across «и»: «в Голла́ндии и А́нглии».
4. в/на with a direction verb takes the accusative; otherwise the prepositional.
5. Quantities: нет, мно́го, два, пять.
6. Noun-phrase agreement: «ру́сского чаепи́тия» is genitive singular.
7. Possession.
8. Negated existence takes the genitive: «его́ не́ было».
9. A span of time is accusative: «спала́ всю ночь».
10. A number after a verb is accusative: «смотре́ли два часа́».
11. After a reflexive verb, genitive over accusative: «испуга́лись челове́ка».
12. Subject before the verb, object after a transitive verb.
13. Lists inherit the case of their first member: «купи́ла хлеб, сыр, молоко́».

Every decision a rule had to make is listed in `tools/reports/stories.md`. I reviewed the borderline ones and
fixed the patterns behind them.

**Graded reader** (Read tab). It has **40 texts**:

| Level | Texts |
|---|---|
| A2 | 10 |
| B1 | 10 |
| B2 | 3 stories and 7 non-fiction pieces |
| C1 | 3 stories and 7 non-fiction pieces |

That's 6,083 words in total.

The recurring characters carry two series: Anya's first year in Moscow (A2), and a dacha mystery with letters
from 1961 (B1). It ends in a C1 epilogue.

The non-fiction covers the banya, Peter the Great's city, Gagarin, tea and the samovar, the Moscow metro, ты/вы,
the dacha, Baikal, Pushkin, the Trans-Siberian, kitchen conversations, the Leningrad blockade, the Russian smile
and why Russian is worth the difficulty.

Each text has 3–4 comprehension questions.

**In the reader:**

- Tap any word for its meaning, dictionary form, analysis in plain English ("verb (perfective) · past,
  feminine") and stress. You can listen to it, add it to your deck, or open all its forms.
- Rare words for your level get a small inline gloss.
- Stress marks and glosses are on by default at A2–B1 and off at B2–C1. You can toggle them, and the English
  translation of each sentence.
- **Listen** reads the text sentence by sentence and highlights the current one. You can change the speed and
  start from any sentence.
- Finishing the questions counts towards the story quest and the 1 / 10 / 40-stories achievements.

**Listening** (Practice → Listening and speaking):

- **20 dialogues**: 8 at A2, 8 at B1 and 4 at B2. They cover shops, cafés, directions, tickets, the doctor,
  flats, neighbours, an interview, a refund and more. The transcript is hidden until you ask for it, and each
  speaker gets a different voice (or pitch, if the device has only one).
- **Dictation** from the sentence bank, marked word by word.
- **ы or и?** and **Hard or soft?**: hear one of a pair (был/бил, брат/брать, у́гол/у́голь) and choose.
- **Unstressed о**: dictation of words where о is heard as а ("you hear «малако», you write молоко́").
- **Shadowing**: hear it, say it. In Chrome the microphone button transcribes what you said and marks it. In
  other browsers you compare yourself with the text.

**Keyboard** (Practice → Keyboard):

- 13 lessons from the home row outwards, with an on-screen keyboard that lights up the next key and colours each
  finger's keys.
- It reads *physical key positions*, so it works before the Russian layout is installed. It also accepts input
  from a phone's Russian keyboard.
- Lessons use real words built only from the letters learned so far, and the last one uses real sentences.
- Words-per-minute and accuracy are tracked per lesson. 90% opens the next one.
- Setup help covers Windows, macOS, iPhone and Android.

**Navigation:** Home · Course · Review · **Read** · **Practice** (trainers, listening, keyboard) · **Reference**
(grammar, with the dictionary lab one tap away). The daily plan now includes "Read: <next story>".

**Dictionary fixes found while writing.** Real stories exercise the dictionary much harder than drills, and
four Phase 0 bugs surfaced:

- **Indeclinable nouns were dropped.** The dataset leaves their tables empty, so кафе́, метро́, ко́фе, такси́,
  пальто́ and 293 others never entered the lexicon. They're now kept, with every form equal to the lemma.
- **Words whose pymorphy3 lemma differs were unranked.** сча́стье is filed as "счастие" and де́ньги as
  "деньга", so all their forms counted as unverified, and the words were classed as suspect and dropped from
  the ranked dictionary. де́ньги is now rank 149 (A1) and сча́стье rank 900 (A2).
- **The frequency rule was too strict.** A form counted as evidence only if no other lemma shared it, so кафе́
  (also a form of a rare noun "каф") scored zero and landed at C2. A clearly dominant reading now counts too.
  кафе́ is B1, and the junk words the rule was built for (ага́ "cane toad", уж "grass snake") still score zero.
- **Missing from the dataset entirely:** как, наш, ваш, пусть, the numbers 11–19, and быть's future
  (бу́ду…). These are added through `closed_class.json` and `overrides.json`, so validate.py checks them.

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

**Phase 4**

- **All 40 stories now, not 15.** The brief planned 15 here and the rest in Phase 6. Writing them in one go kept
  the series consistent. Phase 6 can now focus on the B1–C1 course units and idioms.
- **Tapping a word doesn't add it to the deck automatically.** The sheet has an "Add to my deck" button. An
  automatic add would fill the deck with every word you were merely curious about.
- **Stories avoid gerunds and participles the dictionary doesn't hold.** Rather than leaving such words
  unanalysed, I rephrased (держа́ → а на рука́х у неё сиде́л…). At C1 this costs a little stylistic range. It's
  worth revisiting if the dictionary gains participle tables.
- **Shadowing with speech recognition is the one exception to "zero runtime API calls".** Chrome's
  `webkitSpeechRecognition` sends the audio to Google's service. It runs only when you tap the microphone, and
  everything works without it. Firefox and Safari fall back to self-checking.
- **Sound-pair items use fixed word lists** (14 pairs) because they need real minimal pairs. Dictation and а́канье
  are generated.
- **The keyboard trainer reports each finished line to the reward service** as an item, so typing earns XP and
  feeds the streak like anything else. A line counts as correct only when it was typed without errors.

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
- Ghost races, collectible cards and the town are Phase 5 (cards and the town are chunk 3).

## Known issues

- **A dictionary rebuild is due.** Rerunning `tools/ingest.py` now ranks **мно́гие** (rank 920, A2). It was
  missing because of the lemma mismatch fixed in Phase 4, which never had a full rebuild. Accepting it shifts
  11,478 later ranks by one and moves a word at each level boundary. I didn't fold that into Phase 7. To do it:
  `npm run data:ingest && python3 tools/stories.py && npm run check`, then review the diff.
- The Phase 0 known issues still stand (morph disagreements report, 9 suspect top-5000 words, unverified short
  adjectives).
- Headless Chromium has no Russian voices, so audio cards and listen items were verified by tests only. Please
  try a review session on your phone.
- Tatoeba translations are community-written; a few English glosses are loose. Each sentence links to its
  source page.
- The motion diagrams animate with CSS `offset-path`. Safari before 16 (2022) shows them static, which still
  reads correctly.
- The story analysis has a review report (`tools/reports/stories.md`, about 1,600 decisions). I checked the
  borderline patterns, not every line. If a tapped word shows an odd case, tell me the story and sentence.
- The dataset stresses по́лчаса (standard: полчаса́) and lacks some common short participles. Stories
  work around both.
- Listening drills need a Russian TTS voice. Without one, the Listening page explains how to add one and offers
  only the dialogue transcripts.

## Content counts

| Content | Count |
|---|---|
| Lexemes | 43,377 (12,392 ranked A1–C2) |
| Example sentences (verified, stressed, analysed) | 33,176 |
| Stories and non-fiction | 40 (A2 10, B1 10, B2 10, C1 10), 6,083 analysed words, 147 questions |
| Dialogues | 20 (A2 8, B1 8, B2 4), 1,159 words, 60 questions |
| Keyboard lessons | 13 |
| Grammar articles | 51 (1 A1, 20 A2, 10 B1, 10 B2, 10 C1) |
| Course units | 66 (1 A1, 20 A2, 20 B1, 15 B2, 10 C1), 739 unit words, 66 bosses |
| Hand-written exercise items | 363 (221 in units, 8 placement, 71 aspect, 63 motion) |
| Trainer prepositions / minimal pairs | 40 / 14 |
| Error types | 51 |
| Grammar tags | 76 |
| Achievements | 80 (all active, 12 hidden) |
| Idioms and culture entries | 77 |
| Collectible cards | 32 in 4 sets, 528 analysed words |
| Unit bosses | 20 |
| «Де́ло» | 5 chapters, 35 scenes, 3 grammar gates, 9 parser verbs |
| Quests | 15 daily, 4 weekly templates |
| Themes | 6 |

## Review queue (`"review": true`)

None. All the hand-written Russian passes `validate.py`, including the dictionary-stress check, and I
re-checked the homographs by hand. Corrections I made along the way, for the record:

- Phase 2: письмо́, де́ньги, о́тдал, приезжа́й, це́ны; по́ездом instead of на по́езде;
- Phase 3: the imperative of переби́ть is **перебе́й** (I'd written переби́й, and pymorphy3 flagged it).
  I rephrased an example to avoid ко́е-что, whose stress dictionaries disagree on.
- Phase 4: the dictionary-stress check caught dozens of slips in my story drafts. Among them:
  - wrong stress: у́тром, подно́с, оди́н, весёлым, морски́е, невероя́тно, люби́л, косми́ческий, снача́ла,
    остаётся (twice!), измене́ние, приезжа́ют, сни́зу, плати́ть, во́семьдесят, девяти́, начала́;
  - missing marks: тру́бку, е́ли, о́пыт, па́чка, де́вять and others.
  Every one is fixed. None of the story text is marked for review.

- Phase 5: the dictionary-stress check caught мо́лча, следы́, за кото́м, в деревня́х and ло́вят (I'd stressed
  them wrong). It also caught поня́тнее, a form the lexicon lacks; I rephrased that sentence.

- Phase 6: the checks caught аэропо́рту (I rephrased), посту́пит, стари́к, спле́тница, скупо́й, левша́, зага́дки,
  прави́тельство, гля́нуть, руга́ют and ви́лами. Two stresses are deliberate and allowlisted with a note: **в связи́ с**
  (the fixed preposition uses the locative stress) and **ни фига́** (the slang phrase, unlike the noun фи́га). Folklore
  boss names are allowlisted too.

If anything reads oddly to you, tell me the unit or article and I'll fix it.

## Next

All seven phases of the brief are done. Ideas if you want to keep going (none is started):

- **Sync between devices.** It would need an account and a server (or a file in your own cloud drive), which
  ends "zero runtime API calls". Export/Import covers it for now.
- **Recorded audio** for the stories, instead of the device's text-to-speech voice.
- **More content**: more C1 units and texts, and B2/C1 dialogues.
- **The learner's own words**: add any text, get it analysed against the lexicon, and turn it into cards.
