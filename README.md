# Медведь: an offline Russian course

An installable, fully offline PWA that takes a learner from upper beginner (A2) to advanced (C1).
No backend, no API calls: all content ships as static data built from open linguistic datasets.

- `CLAUDE.md`: architecture and conventions
- `PROGRESS.md`: status, decisions, known issues

```sh
npm install
pip install -r tools/requirements.txt
npm run check        # python tests, data validation, typecheck, unit tests
npm run dev
```

Rebuilding the dictionary from source: `npm run data:fetch && npm run data:ingest && npm run data:validate`.

Data: OpenRussian (CC BY-SA 4.0), FrequencyWords/OpenSubtitles (CC BY-SA 4.0), verified with pymorphy3/OpenCorpora.
See the in-app Attributions page.
