# Медведь: an offline Russian course

An installable, fully offline PWA that takes a learner from upper beginner (A2) to advanced (C1).
No backend, no accounts, no API calls: all content ships as static data built from open linguistic datasets,
and your progress stays in your own browser.

**Use it:** https://mark-152-w.github.io/Russian-learner/

On a phone, open the link and choose **Add to Home Screen** (Safari: Share menu; Chrome: ⋮ menu).
It then opens like an app and works without a connection.

## What's inside

- **Course:** 65 units (A2 20, B1 20, B2 15, C1 10), each with drills, a checkpoint and a boss, plus a placement test.
- **Reference:** 50 grammar articles, a declension lab for any word, and 77 idioms and customs.
- **Review:** spaced-repetition vocabulary (FSRS), with cards for the forms you get wrong.
- **Practice:**
  - trainers for cases, aspect, verbs of motion, stress and numerals;
  - listening and dictation;
  - a ЙЦУКЕН keyboard course.
- **Reading:** 40 graded stories and 20 dialogues; tap any word for its meaning and grammar.
- **Games:** the case arcade, speed match, the declension crossword and «Де́ло», a detective text adventure.
- **Motivation:** XP, streaks, quests, achievements, chests, collectible cards, a town that grows as you learn,
  and a stats page.

## Your data

Progress lives in the browser's storage (IndexedDB) on each device, and it isn't synced. To move devices or
keep a backup, use **Settings → Export** and **Import**. Clearing the browser's site data erases it.

## Development

```sh
npm install
pip install -r tools/requirements.txt
npm run check        # python tests, data validation, typecheck, unit tests
npm run dev          # http://localhost:5173/Russian-learner/
npm run build        # BASE=/ npm run build for hosting at a domain root
```

Rebuilding the dictionary from source: `npm run data:fetch && npm run data:ingest && npm run data:validate`.
After editing stories or card texts: `python3 tools/stories.py`.

Pushes to `main` deploy to GitHub Pages (`.github/workflows/deploy.yml`). Installed copies show
**A new version is ready** and update when the learner chooses, never mid-lesson.

- `CLAUDE.md`: architecture and conventions
- `PROGRESS.md`: status, decisions, known issues

## Credits

Data:
- OpenRussian (CC BY-SA 4.0);
- FrequencyWords / OpenSubtitles (CC BY-SA 4.0);
- Tatoeba sentences (CC BY 2.0 FR);
- verified with pymorphy3 / OpenCorpora.

See the in-app Attributions page.
