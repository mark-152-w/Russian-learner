# Content licence

Медведь has three kinds of material, under three licences.

| What | Where | Licence |
|---|---|---|
| Code | everything not listed below, including `src/**/*.ts(x)`, `tools/*.py`, `scripts/`, `schemas/` and the icons in `public/` | [MIT](LICENSE) |
| Course content and dictionary data | `src/data/` (except `src/data/sentences/`), `tools/stories/`, `tools/cards/`, `tools/closed_class.json`, `tools/overrides.json`, `tools/allowlist.txt` | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Example sentences | `src/data/sentences/`, `tools/raw/tatoeba/`, `public/credits/tatoeba.txt` | [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/) |

You may copy, adapt and share any of it, including commercially, as long as you keep the credits below and say what you changed.
Content you adapt from the CC BY-SA part must be shared under CC BY-SA 4.0 too.

## Course content and dictionary data (CC BY-SA 4.0)

The dictionary in `src/data/lexicon/` is adapted from two CC BY-SA 4.0 sources, which is why this content is CC BY-SA:

- **[OpenRussian dictionary data](https://github.com/Badestrand/russian-dictionary)** (CC BY-SA 4.0), at the commit pinned in `tools/sources.json`.
  - **Changes:** converted into positional form tables, filtered, given levels by frequency, and corrected by hand (`tools/overrides.json`).
  - Forms were also checked against pymorphy3, and the unverified ones are marked.
- **[FrequencyWords](https://github.com/hermitdave/FrequencyWords)**, from the OpenSubtitles 2018 Russian list (CC BY-SA 4.0).
  - **Used for:** ranking the words and assigning their levels.
  - The list itself isn't shipped.

Forms and grammatical tags were checked at build time with
[pymorphy3](https://github.com/no-plagiarism/pymorphy3) (MIT) and its [OpenCorpora](https://opencorpora.org/) dictionary (CC BY-SA 3.0).

These were written for Медведь and are licensed CC BY-SA 4.0 by mark-152-w and the Медведь contributors:

- the grammar articles;
- the units and exercises;
- the stories and dialogues;
- the idioms;
- the cards;
- the «Де́ло» chapters;
- the error taxonomy and tags.

Some texts cite or mention public-domain works (Krylov, Pushkin) and historical facts. Nothing in them is quoted from a work still under copyright.

## Example sentences (CC BY 2.0 FR)

The example sentences come from the **[Tatoeba Project](https://tatoeba.org)**. They were downloaded via the
[manythings.org/anki](https://www.manythings.org/anki/) Russian–English file, which is kept unchanged in `tools/raw/tatoeba/`.

- **Authors:** each sentence and translation is by its Tatoeba contributor. `public/credits/tatoeba.txt` lists every sentence the app uses, with its id and the usernames of the Russian author and of each translation's author. The app links that list from its Attributions page, and each sentence's page is at `https://tatoeba.org/en/sentences/show/<id>`.
- **Changes:**
  - sentences were selected by vocabulary level;
  - stress marks were added to the Russian;
  - ё was restored where the dictionary has it.

  The English translations are unchanged.

## Third-party software and fonts

The built site bundles open-source libraries (React, Dexie, ts-fsrs, react-router and Workbox) and the PT Sans and
PT Serif fonts by ParaType ([SIL Open Font License 1.1](https://openfontlicense.org)).

`scripts/licenses.mjs` writes their licence texts, including any NOTICE files, into `third-party-licenses.txt` on every build.
That file is served with the site.
