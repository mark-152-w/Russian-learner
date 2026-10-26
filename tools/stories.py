#!/usr/bin/env python3
"""Build analysed stories and dialogues from hand-written sources (tools/stories/*.txt).

Every word gets its lexeme, stressed lemma and grammemes at build time; validate.py re-checks each analysis
against pymorphy3. Nothing is guessed at runtime.

Source format (UTF-8 text):

    id: st-a2-01
    kind: story                 (story | nonfiction | dialogue)
    level: A2
    series: anya                (optional, with chapter:)
    chapter: 1
    title: Но́вая кварти́ра | A new flat
    characters: А́ня, Ми́ша      (optional)
    cliffhanger: English teaser (optional)
    ---
    А́ня живёт в Москве́. | Anya lives in Moscow.      one sentence per line: Russian | English
                                                      a blank line starts a new paragraph
    А́ня: Приве́т! | Hi!                               dialogues: "Speaker: text | English"
    ---
    ? Где живёт А́ня? | Where does Anya live?           comprehension question (Russian | English)
    + В Москве́.                                       the right answer
    - В Каза́ни.                                       wrong answers
    ! Reason shown after answering (optional).

Hints after a word, in braces, settle what context rules can't: сло́во{acc}, {pl_gen}, {n:замок:2},
{n:замок:2|sg_acc}, {=contextual gloss}; combine with ';'. Stress written in the text also picks between
homographs (за́мок / замо́к, ру́ки / руки́).

Context rules, in order: the written stress; hints; a governing preposition (в + acc/prep, без + gen…);
quantities (нет, мно́го, два…); agreement of adjectives and determiners with the next noun; the prepositional
needs a preposition; subject before the verb / object after a transitive verb. Whatever a rule had to choose
between is listed in tools/reports/stories.md for review.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from morph import dparses  # noqa: E402
from rulib import fold, has_stress, syllables  # noqa: E402
from sentences import build_index  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "stories"
OUT = ROOT / "src" / "data" / "content" / "stories"
LEX = ROOT / "src" / "data" / "lexicon"
REPORT = ROOT / "tools" / "reports" / "stories.md"

TOKEN = re.compile(r"(?P<word>[А-Яа-яЁё́̀]+(?:-[А-Яа-яЁё́̀]+)*)(?:\{(?P<hint>[^}]*)\})?|(?P<num>\d+(?:[.,:]\d+)?)|(?P<punct>[^\sА-Яа-яЁё\d])")
CASES = ["nom", "acc", "gen", "dat", "ins", "prep", "loc2"]
RARE_ABOVE = {"A1": 600, "A2": 1500, "B1": 3000, "B2": 5500, "C1": 9000, "C2": 13000}

PREP_CASES = {
    "без": {"gen"}, "безо": {"gen"}, "для": {"gen"}, "до": {"gen"}, "из": {"gen"}, "изо": {"gen"}, "от": {"gen"}, "ото": {"gen"},
    "у": {"gen"}, "около": {"gen"}, "после": {"gen"}, "кроме": {"gen"}, "мимо": {"gen"}, "против": {"gen"},
    "вместо": {"gen"}, "среди": {"gen"}, "из-за": {"gen"}, "из-под": {"gen"}, "вокруг": {"gen"}, "возле": {"gen"},
    "напротив": {"gen"}, "внутри": {"gen"}, "посреди": {"gen"}, "вдоль": {"gen"}, "насчет": {"gen"}, "ради": {"gen"},
    "к": {"dat"}, "ко": {"dat"}, "благодаря": {"dat"}, "вопреки": {"dat"}, "навстречу": {"dat"}, "согласно": {"dat"},
    "по": {"dat", "acc", "prep"}, "в": {"acc", "prep", "loc2"}, "во": {"acc", "prep", "loc2"},
    "на": {"acc", "prep", "loc2"}, "через": {"acc"}, "сквозь": {"acc"}, "про": {"acc"}, "за": {"acc", "ins"},
    "под": {"acc", "ins"}, "подо": {"acc", "ins"}, "с": {"gen", "ins", "acc"}, "со": {"gen", "ins", "acc"},
    "над": {"ins"}, "надо": {"ins"}, "перед": {"ins"}, "передо": {"ins"}, "между": {"ins", "gen"},
    "о": {"prep", "acc"}, "об": {"prep", "acc"}, "обо": {"prep", "acc"}, "при": {"prep"},
}
QUANT_GEN = {"нет", "много", "мало", "сколько", "несколько", "немного", "больше", "меньше", "столько", "полно"}
FEW = {"два", "две", "три", "четыре", "оба", "обе", "полтора", "полторы"}
MANY = {"пять", "шесть", "семь", "восемь", "девять", "десять", "двадцать", "тридцать", "сорок", "сто"}
TIME_NOUNS = {"час", "минута", "секунда", "день", "ночь", "неделя", "месяц", "год", "вечер", "утро", "лето", "зима",
              "весна", "осень", "время", "жизнь", "раз"}
# в/на + accusative (direction) after these; otherwise в/на + prepositional (location) when the form can't tell
DIRECTION_VERBS = ("йти", "ходить", "ехать", "езжать", "бежать", "бегать", "лететь", "летать", "плыть", "плавать",
                   "нести", "носить", "вести", "водить", "везти", "возить", "сесть", "садиться", "лечь", "ложиться",
                   "ставить", "класть", "положить", "попасть", "смотреть", "ответить", "отвечать", "опоздать",
                   "опаздывать", "играть", "верить", "поверить", "надеяться", "поступить", "поступать", "уехать")
BE_FORMS = {"было", "будет", "есть", "был", "была", "были", "будут"}
CLAUSE_BREAK = {",", ";", ":", "—", "(", ")", "«", "»", ".", "!", "?", "…"}
CLAUSE_CONJ = {"и", "а", "но", "что", "когда", "если", "потому", "где", "куда", "который", "которая", "которое",
               "которые", "чтобы", "пока", "хотя", "или", "как"}
OTHER_POS = [("PREP", "prep"), ("ADVB", "adv"), ("PRED", "pred"), ("CONJ", "conj"), ("NPRO", "pron"), ("PRCL", "part"),
             ("NUMR", "num"), ("INTJ", "intj"), ("COMP", "comp")]
# uninflected words whose usual role the POS order above gets wrong
PREFERRED_POS = {"же": "part", "ли": "part", "бы": "part", "ведь": "part", "вот": "part", "даже": "part", "только": "part",
                 "ну": "intj", "да": "part", "ни": "part", "уж": "part", "лишь": "part", "разве": "part", "неужели": "part"}


# --------------------------------------------------------------------------- lexicon
def load_lexicon():
    lex = {}
    for p in sorted(LEX.glob("*.json")):
        if p.stem in ("slots",) or p.stem.startswith("index"):
            continue
        for x in json.loads(p.read_text(encoding="utf-8")):
            lex[x["id"]] = x
    return lex


def case_of(slot: str) -> str | None:
    """Case grammeme of a slot: sg_gen → gen, m_acc_an → acc, gen (closed class) → gen."""
    for part in slot.split("_"):
        if part in CASES:
            return part
    return None


def number_of(slot: str) -> str | None:
    if slot.startswith("sg_"):
        return "sg"
    if slot.startswith("pl_"):
        return "pl"
    if slot[:2] in ("m_", "f_", "n_"):
        return "sg"
    return None


def gender_of(slot: str) -> str | None:
    return slot[0] if slot[:2] in ("m_", "f_", "n_") else None


class Ctx:
    def __init__(self):
        self.index, self.names = build_index(include_ext=True)
        self.lex = load_lexicon()
        self.closed_entries = {e["lemma"]: e for e in json.loads((ROOT / "tools" / "closed_class.json").read_text(encoding="utf-8"))["entries"]}
        self.closed_by_fold = {fold(k): v for k, v in self.closed_entries.items()}

    def kind(self, lexid: str) -> str:
        """noun / verb / adj / other / pron / num / name."""
        x = self.lex.get(lexid)
        if x:
            if x["pos"] == "other":
                e = self.closed_by_fold.get(fold(x["lemma"]))
                return e["kind"] if e and e["kind"] in ("pron", "num") else "other"
            return x["pos"]
        prefix = lexid.split(":", 1)[0]
        return prefix if prefix in ("name", "num", "pron") else "other"

    def lemma(self, lexid: str) -> str:
        x = self.lex.get(lexid)
        return x["lemma"] if x else lexid.split(":", 1)[1]

    def closed(self, lexid: str) -> dict:
        return self.closed_by_fold.get(fold(self.lemma(lexid)), {})

    def sub(self, lexid: str) -> list:
        """pymorphy3 parts of speech of an uninflected word (lexicon or closed-class 'word')."""
        return self.lex.get(lexid, {}).get("sub") or self.closed(lexid).get("sub") or []


# --------------------------------------------------------------------------- analysis of one word
class Word:
    def __init__(self, text: str, hint: str | None, initial: bool):
        self.t = text
        self.hint = hint or ""
        self.initial = initial
        self.cands: list[tuple] = []  # (lex, slot, form, rank, proper)
        self.notes: list[str] = []
        self.gloss: str | None = None
        self.pos_other: str | None = None
        self.error: str | None = None

    # helpers over the current candidates
    def lexes(self):
        return sorted({c[0] for c in self.cands})

    def cases(self):
        return {case_of(c[1]) for c in self.cands} - {None}

    def keep(self, pred, why: str | None = None) -> bool:
        kept = [c for c in self.cands if pred(c)]
        if kept and len(kept) < len(self.cands):
            if why:
                self.notes.append(why)
            self.cands = kept
            return True
        return False


def lookup(w: Word, ctx: Ctx):
    cands = ctx.index.get(fold(w.t))
    if not cands:
        w.error = f"«{w.t}» is not in the lexicon (add it, a name to closed_class.json, or rephrase)"
        return
    capital = w.t[:1].isupper()
    if capital and fold(w.t) in ctx.names:
        cands = [c for c in cands if c[4]] or cands
    elif capital and not w.initial:
        cands = [c for c in cands if c[4]] or cands
    else:
        cands = [c for c in cands if not c[0].startswith("name:")] or cands
    # written stress (and ё) picks between homographs; an unmarked monosyllable matches anything
    written = w.t.lower()
    if getattr(w, "clitic", False) and not has_stress(written):
        pass  # не́ было, на́ пол: the stress sits on the proclitic, the word itself is unmarked
    elif syllables(written) == 1 and has_stress(written):
        # a stressed proclitic carrying its group's stress (не́, на́, по́)
        cands = [c for c in cands if fold(c[2]) == fold(written)] or cands
    elif has_stress(written) or "ё" in written:
        exact = [c for c in cands if c[2].lower() == written]
        if not exact:
            w.error = f"«{w.t}»: stress/spelling differs from the dictionary ({', '.join(sorted({c[2] for c in cands}))})"
            return
        cands = exact
    elif syllables(written) > 1:
        unmarked = [c for c in cands if not has_stress(c[2])]
        if not unmarked:
            w.error = f"«{w.t}» needs a stress mark ({', '.join(sorted({c[2] for c in cands}))})"
            return
        cands = unmarked
    w.cands = list(dict.fromkeys(cands))
    for h in filter(None, (x.strip() for x in w.hint.split(";"))):
        if h.startswith("="):
            w.gloss = h[1:]
        elif ":" in h and h.split(":")[0] in ("n", "v", "a", "o", "name"):
            lexid, _, slot = h.partition("|")
            if not w.keep(lambda c: c[0] == lexid and (not slot or c[1] == slot)):
                if not any(c[0] == lexid for c in w.cands):
                    w.error = f"«{w.t}»: hint {h} matches no reading"
        else:
            if not w.keep(lambda c, h=h: c[1] == h or case_of(c[1]) == h or c[1].endswith("_" + h)):
                if not any(c[1] == h or case_of(c[1]) == h for c in w.cands):
                    w.error = f"«{w.t}»: hint {{{h}}} matches no reading ({', '.join(sorted({c[1] for c in w.cands}))})"


def is_prep(w: Word, ctx: Ctx) -> bool:
    return any(ctx.kind(c[0]) == "other" and "PREP" in ctx.sub(c[0]) for c in w.cands) or fold(w.t) in PREP_CASES


def nominal(w: Word, ctx: Ctx) -> bool:
    return any(ctx.kind(c[0]) in ("noun", "adj", "pron", "num", "name") and c[1] for c in w.cands)


def is_noun(w: Word, ctx: Ctx) -> bool:
    return any(ctx.kind(c[0]) in ("noun", "name") or (ctx.kind(c[0]) == "pron" and c[1] and "_" not in c[1]) for c in w.cands)


def finite_verb(w: Word, ctx: Ctx):
    """-> 'tran' / 'intr' if the word is (only) a verb form, else None."""
    if not w.cands or not all(ctx.kind(c[0]) == "verb" for c in w.cands):
        return None
    lemma = fold(ctx.lemma(w.cands[0][0]))
    tags = [p.tag for p in dparses(lemma) if p.tag.POS == "INFN"]
    return "tran" if any("tran" in t for t in tags) and not lemma.endswith(("ся", "сь")) else "intr"


def disambiguate(words: list, ctx: Ctx):
    items = [x for x in words if isinstance(x, Word) and x.cands]
    seq = [x for x in words]  # words and punctuation strings, in order

    def prev_words(i):
        j = i - 1
        while j >= 0:
            yield seq[j]
            j -= 1

    # 1. lexeme choice where several lexemes share the spelling and stress
    for i, w in enumerate(seq):
        if not isinstance(w, Word) or len(w.lexes()) < 2:
            continue
        nxt = seq[i + 1] if i + 1 < len(seq) and isinstance(seq[i + 1], Word) else None
        kinds = {lx: ctx.kind(lx) for lx in w.lexes()}
        # a determiner/adjective reading wins only before a noun it can agree with (э́то vs э́тот)
        if nxt and any(k == "adj" for k in kinds.values()) and nxt.cands and is_noun(nxt, ctx):
            w.keep(lambda c: kinds[c[0]] == "adj")
        elif any(k != "adj" for k in kinds.values()):
            w.keep(lambda c: kinds[c[0]] != "adj")
        if len(w.lexes()) > 1:
            best = min(w.cands, key=lambda c: c[3])[0]
            w.notes.append(f"lexeme: chose {best} over {', '.join(x for x in w.lexes() if x != best)}")
            w.keep(lambda c: c[0] == best)

    # 2. case for nominal words: preposition, quantity, prepositional-needs-preposition
    for i, w in enumerate(seq):
        if not isinstance(w, Word) or not nominal(w, ctx) or len(w.cands) < 2 and not w.cases():
            continue
        prep = None
        quant = None
        for p in prev_words(i):
            if p in ("«", "»", "„", "“"):
                continue
            if not isinstance(p, Word):
                break
            f = fold(p.t)
            if is_prep(p, ctx):
                prep = f
                break
            if f in QUANT_GEN or f in FEW or f in MANY:
                quant = f
                break
            if not (nominal(p, ctx) and not is_noun(p, ctx)):  # skip adjectives/determiners/numerals
                break
        if prep and prep in PREP_CASES:
            w.keep(lambda c: case_of(c[1]) in PREP_CASES[prep] or not case_of(c[1]))
            if prep in ("в", "во", "на") and {"acc", "prep"} <= w.cases():
                verbs = [fold(ctx.lemma(p.cands[0][0])) for p in seq if isinstance(p, Word) and p.cands and finite_verb(p, ctx)]
                motion = any(v.endswith(DIRECTION_VERBS) for v in verbs)
                w.keep(lambda c: case_of(c[1]) == ("acc" if motion else "prep"), "acc: direction" if motion else "prep: location")
        else:
            w.keep(lambda c: case_of(c[1]) not in ("prep", "loc2"))
        if quant:
            if quant in FEW and is_noun(w, ctx):
                w.keep(lambda c: c[1] in ("sg_gen", "gen"))
            elif quant in MANY and is_noun(w, ctx):
                w.keep(lambda c: c[1] in ("pl_gen", "gen"))
            elif quant in QUANT_GEN:
                w.keep(lambda c: case_of(c[1]) == "gen")

    # 3. nouns: possession (noun + noun in gen), then subject/object by the clause's verb
    for i, w in enumerate(seq):
        if isinstance(w, Word) and fold(w.t) in ("что", "чем") and w.after_comma and w.cands:
            w.pos_override = "conj"  # «я ви́дела, что …»
            w.cands = w.cands[:1]
            continue
        if not isinstance(w, Word) or not (is_noun(w, ctx) or fold(w.t) in ("его", "её", "их")) or len(w.cases()) < 2:
            continue
        before = [p for p in seq[max(0, i - 3):i]]
        prev_noun = next((p for p in reversed(before) if isinstance(p, Word)), None)
        if "gen" in w.cases() and prev_noun and is_noun(prev_noun, ctx) and not is_prep(prev_noun, ctx):
            if w.keep(lambda c: case_of(c[1]) == "gen", "gen: follows a noun (possession)"):
                continue
        # clause = between breaks
        lo = i
        while lo > 0 and not (isinstance(seq[lo - 1], str) and seq[lo - 1] in CLAUSE_BREAK) and not (isinstance(seq[lo - 1], Word) and fold(seq[lo - 1].t) in CLAUSE_CONJ):
            lo -= 1
        hi = i
        while hi + 1 < len(seq) and not (isinstance(seq[hi + 1], str) and seq[hi + 1] in CLAUSE_BREAK) and not (isinstance(seq[hi + 1], Word) and fold(seq[hi + 1].t) in CLAUSE_CONJ):
            hi += 1
        verb_before = next((finite_verb(p, ctx) for p in reversed(seq[lo:i]) if isinstance(p, Word) and finite_verb(p, ctx)), None)
        verb_after = any(isinstance(p, Word) and finite_verb(p, ctx) for p in seq[i + 1:hi + 1])
        clause = [fold(p.t) for p in seq[lo:hi + 1] if isinstance(p, Word)]
        negated_be = "нет" in clause or any(a == "не" and b in BE_FORMS for a, b in zip(clause, clause[1:]))
        if negated_be and w.keep(lambda c: case_of(c[1]) == "gen", "gen: negated existence (не́ было, нет)"):
            continue
        lemma = fold(ctx.lemma(w.cands[0][0]))
        if lemma in TIME_NOUNS and (verb_before or verb_after) and w.keep(lambda c: case_of(c[1]) == "acc", "acc: a span of time"):
            continue
        if not verb_before and not verb_after:
            # a list (хлеб, сыр, молоко́ и ры́бу): take the case of the noun before the comma / и / или
            j = lo - 1
            if j >= 0 and (seq[j] == "," or (isinstance(seq[j], Word) and fold(seq[j].t) in ("и", "или"))):
                prev = next((p for p in reversed(seq[max(0, j - 4):j]) if isinstance(p, Word) and is_noun(p, ctx)), None)
                if prev and len(prev.cases()) == 1:
                    c0 = next(iter(prev.cases()))
                    if w.keep(lambda c: case_of(c[1]) == c0, f"{c0}: listed after {prev.t}"):
                        continue
        if verb_before == "tran":
            w.keep(lambda c: case_of(c[1]) == "acc", "acc: after a transitive verb") or w.keep(lambda c: case_of(c[1]) == "gen", "gen: after a transitive verb")
        elif verb_before == "intr" or verb_after or not verb_before:
            w.keep(lambda c: case_of(c[1]) == "nom", "nom: subject")

    # 3b. a number after a verb (смотре́ли два часа́, е́хать три ста́нции) is accusative, except after быть
    for i, w in enumerate(seq):
        if not isinstance(w, Word) or not any(ctx.kind(c[0]) == "num" for c in w.cands) or not {"nom", "acc"} <= w.cases():
            continue
        lo = i
        while lo > 0 and not (isinstance(seq[lo - 1], str) and seq[lo - 1] in CLAUSE_BREAK):
            lo -= 1
        verbs = [p for p in seq[lo:i] if isinstance(p, Word) and finite_verb(p, ctx)]
        if verbs and fold(ctx.lemma(verbs[-1].cands[0][0])) != "быть":
            w.keep(lambda c: case_of(c[1]) == "acc", "acc: a number after the verb")
        else:
            w.keep(lambda c: case_of(c[1]) == "nom")

    # 4. adjectives/determiners agree with the next noun
    for i, w in enumerate(seq):
        if not isinstance(w, Word) or not nominal(w, ctx) or is_noun(w, ctx) or len(w.cands) < 2:
            continue
        head = None
        for x in seq[i + 1:i + 4]:
            if not isinstance(x, Word):
                break
            if is_noun(x, ctx):
                head = x
                break
            if not nominal(x, ctx):
                break
        if head:
            hc = head.cands[0][1]
            hcase, hnum = case_of(hc), number_of(hc) or "sg"
            hgen = ctx.lex.get(head.cands[0][0], {}).get("gender")
            anim = ctx.lex.get(head.cands[0][0], {}).get("animate")

            def agrees(c):
                s = c[1]
                if case_of(s) != hcase:
                    return False
                if hnum == "pl":
                    return s.startswith("pl_") or not s[:2] in ("m_", "f_", "n_")
                if s.startswith("pl_"):
                    return False
                if hgen and s[:2] in ("m_", "f_", "n_") and s[0] != hgen:
                    return False
                if hcase == "acc" and s.endswith("_an") != bool(anim) and (s.startswith(("m_", "pl_"))):
                    return False
                return True
            if not w.keep(agrees):
                w.notes.append(f"no agreement with {head.t}")

    # 5. verbs: imperative vs 2pl present (говори́те)
    for i, w in enumerate(seq):
        if not isinstance(w, Word) or len(w.cands) < 2 or not all(ctx.kind(c[0]) == "verb" for c in w.cands):
            continue
        has_vy = any(isinstance(p, Word) and fold(p.t) == "вы" for p in seq[max(0, i - 3):i])
        if has_vy:
            w.keep(lambda c: c[1] != "imp_pl")
        else:
            w.keep(lambda c: c[1] != "np_2pl")

    # 6. anything still open: take the first reading, note it
    for w in items:
        if len({c[1] for c in w.cands}) > 1:
            options = sorted({c[1] for c in w.cands}, key=lambda s: (s.startswith("pl_") or s.endswith("pl"), CASES.index(case_of(s)) if case_of(s) in CASES else 9, s))
            w.notes.append(f"open: {'/'.join(options)} → {options[0]}")
            w.cands = [c for c in w.cands if c[1] == options[0]][:1]


def other_pos(w: Word, nxt, ctx: Ctx) -> str:
    sub = ctx.sub(w.cands[0][0])
    f = fold(w.t)
    if f == "надо" and has_stress(w.t):
        return "pred"  # на́до "must"; the preposition надо (мной) is unstressed
    if f in PREFERRED_POS and any(t for t, p in OTHER_POS if p == PREFERRED_POS[f] and t in sub):
        return PREFERRED_POS[f]
    if ("PREP" in sub or f in PREP_CASES) and nxt is not None and isinstance(nxt, Word) and nominal(nxt, ctx):
        return "prep"
    if f in ("что", "как", "когда", "где", "куда", "пока", "чем") and w.after_comma:
        if "CONJ" in sub or f in ("что", "как", "когда"):
            return "conj"
    for tag, pos in OTHER_POS:
        if tag == "PREP":
            continue
        if tag in sub:
            return pos
    if "ADJS" in sub:
        return "adv"
    return "prep" if "PREP" in sub else "part"


def grammemes(w: Word, ctx: Ctx, nxt) -> dict:
    lexid, slot = w.cands[0][0], w.cands[0][1]
    if getattr(w, "pos_override", None):
        return {"pos": w.pos_override}
    k = ctx.kind(lexid)
    x = ctx.lex.get(lexid, {})
    if not slot and k in ("noun", "verb", "adj"):
        k = "other"  # an uninflected closed-class reading attached to a lexeme (во → в)
    if k == "noun" and "_" not in slot:
        k = ctx.closed(lexid).get("kind", "num")  # a closed-class paradigm attached to a noun entry (ты́сяча…)
    if k == "noun":
        num, case = slot.split("_")
        loc2 = (x.get("forms") or [""] * 13)[12] if len(x.get("forms") or []) > 12 else ""
        if case == "prep" and w.cands[0][2] in [v.lstrip("*") for v in loc2.split("|") if v]:
            case = "loc2"  # в саду́, в углу́: the dataset files the locative under the prepositional too
        return {"pos": "noun", "case": case, "number": num}
    if k == "verb":
        asp = x.get("aspect")
        g = {"pos": "verb"}
        if asp in ("impf", "pf"):
            g["aspect"] = asp
        if slot.startswith("np_"):
            p = slot[3:]
            fut = asp == "pf" or (lexid == "v:быть" and fold(w.t) != "есть")  # быть: бу́ду is future, есть present
            g.update(tense="fut" if fut else "pres", person=int(p[0]), number="sg" if p.endswith("sg") else "pl")
        elif slot.startswith("pst_"):
            s = slot[4:]
            g.update(tense="past", number="pl" if s == "pl" else "sg")
            if s != "pl":
                g["gender"] = s
        elif slot.startswith("imp_"):
            g.update(mood="imp", number="sg" if slot.endswith("sg") else "pl")
        return g
    if k == "adj":
        if slot == "comp":
            return {"pos": "comp"}
        if slot == "sup":
            return {"pos": "adj", "degree": "sup"}
        if slot.startswith("short_"):
            s = slot[6:]
            g = {"pos": "adj", "short": True, "number": "pl" if s == "pl" else "sg"}
            if s != "pl":
                g["gender"] = s
            return g
        g = {"pos": "adj", "case": case_of(slot), "number": "pl" if slot.startswith("pl_") else "sg"}
        if slot[:2] in ("m_", "f_", "n_"):
            g["gender"] = slot[0]
        return g
    if k in ("pron", "num"):
        g = {"pos": k}
        if case_of(slot):
            g["case"] = case_of(slot)
        if gender_of(slot):
            g["gender"] = gender_of(slot)
        if slot.startswith("pl_"):
            g["number"] = "pl"
        return g
    if k == "name":
        return {"pos": "name", "case": case_of(slot) or "nom", "number": "sg"}
    return {"pos": other_pos(w, nxt, ctx)}


# --------------------------------------------------------------------------- source files
def parse_source(path: Path):
    head, body, qs = (path.read_text(encoding="utf-8").split("\n---\n") + ["", ""])[:3]
    meta = {}
    for line in head.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, body, qs


def tokenize(text: str, ctx: Ctx, level: str, problems: list, notes: list, where: str):
    seq = []
    out = []
    first = True
    after_comma = False
    for m in TOKEN.finditer(text):
        sp = m.end() < len(text) and text[m.end()].isspace()
        if m.group("word"):
            w = Word(m.group("word"), m.group("hint"), first)
            w.after_comma = after_comma
            prev = seq[-1] if seq and isinstance(seq[-1], Word) else None
            w.clitic = bool(prev and syllables(prev.t) == 1 and has_stress(prev.t))
            lookup(w, ctx)
            if w.error:
                problems.append(f"{where}: {w.error}")
            seq.append(w)
            out.append((w, sp))
            first = False
            after_comma = False
        else:
            p = m.group("num") or m.group("punct")
            seq.append(p)
            out.append((p, sp))
            after_comma = p == ","
            if p in ".!?…":
                first = True
    disambiguate(seq, ctx)
    tokens = []
    for i, (x, sp) in enumerate(out):
        if isinstance(x, str):
            tok = {"t": x}
            if not sp:
                tok["sp"] = False
            tokens.append(tok)
            continue
        if x.error or not x.cands:
            tokens.append({"t": x.t})
            continue
        nxt = next((y for y, _ in out[i + 1:] if isinstance(y, Word)), None)
        lexid = x.cands[0][0]
        tok = {"t": x.t}
        if not sp:
            tok["sp"] = False
        if lexid in ctx.lex:  # names and closed-class-only words have no lexicon entry
            tok["lex"] = lexid
        tok["lemma"] = ctx.lemma(lexid)
        if getattr(x, "pos_override", None) == "conj" and fold(tok["lemma"]) != fold(x.t):
            tok["lemma"] = x.t.lower()  # «, чем …» is the conjunction чем, not a form of что
            tok.pop("lex", None)
        tok["g"] = grammemes(x, ctx, nxt)
        if x.gloss or (lexid not in ctx.lex and ctx.closed(lexid).get("en")):
            tok["gloss"] = x.gloss or ctx.closed(lexid)["en"]
        rank = ctx.lex.get(lexid, {}).get("rank")
        if rank is None and lexid in ctx.lex and ctx.kind(lexid) not in ("pron", "num", "name"):
            rank = 10**6
        if rank and rank > RARE_ABOVE.get(level, 10**6):
            tok["rare"] = True
        for n in x.notes:
            notes.append(f"{where}: «{x.t}» {n}")
        tokens.append(tok)
    return tokens


def build(path: Path, ctx: Ctx, problems: list, notes: list):
    meta, body, qs = parse_source(path)
    sid = meta["id"]
    level = meta["level"]
    kind = meta.get("kind", "story")
    title_ru, _, title_en = meta["title"].partition("|")
    story = {"$schema": "../../../../schemas/story.schema.json", "id": sid, "kind": kind, "level": level}
    if meta.get("series"):
        story["series"] = meta["series"]
        story["chapter"] = int(meta.get("chapter", 1))
    story["title"] = {"ru": title_ru.strip(), "en": title_en.strip()}
    if meta.get("characters"):
        story["characters"] = [c.strip() for c in meta["characters"].split(",")]
    if meta.get("cliffhanger"):
        story["cliffhanger"] = meta["cliffhanger"]
    sentences = []
    para = True
    for n, line in enumerate(body.splitlines(), 1):
        line = line.strip()
        if not line:
            para = True
            continue
        ru, _, en = line.partition("|")
        ru, en = ru.strip(), en.strip()
        if not en:
            problems.append(f"{path.name}:{n}: missing English after |")
        sent = {}
        if para:
            sent["para"] = True
            para = False
        m = re.match(r"^([А-ЯЁA-Z][^:|]{0,24}):\s+(.*)$", ru) if kind == "dialogue" else None
        if m:
            sent["speaker"] = m.group(1)
            ru = m.group(2)
        sent["en"] = en
        sent["tokens"] = tokenize(ru, ctx, level, problems, notes, f"{path.name}:{n}")
        sentences.append(sent)
    story["sentences"] = sentences
    questions = []
    cur = None
    for line in qs.splitlines():
        line = line.strip()
        if not line or line == "questions:":
            continue
        tag, rest = line[0], line[1:].strip()
        if tag == "?":
            ru, _, en = rest.partition("|")
            cur = {
                "id": f"{sid}-q{len(questions) + 1}",
                "type": "choice",
                "level": level,
                "tags": ["reading"] if kind != "dialogue" else ["listening"],
                "prompt": {"ru": ru.strip(), "en": en.strip(), "instruction": "Choose the answer"},
                "accept": [],
                "distractors": [],
                "source": "handwritten",
            }
            questions.append(cur)
        elif tag == "+" and cur:
            cur["accept"].append(rest)
        elif tag == "-" and cur:
            cur["distractors"].append({"ru": rest, "error": "reading.detail"})
        elif tag == "!" and cur:
            cur["reason"] = rest
    for q in questions:
        if len(q["accept"]) != 1 or len(q["distractors"]) < 2:
            problems.append(f"{path.name}: question {q['id']} needs one + and at least two -")
    story["questions"] = questions
    return story


def main():
    ctx = Ctx()
    OUT.mkdir(parents=True, exist_ok=True)
    problems: list[str] = []
    notes: list[str] = []
    built = []
    for path in sorted(SRC.glob("*.txt")):
        story = build(path, ctx, problems, notes)
        (OUT / f"{story['id']}.json").write_text(json.dumps(story, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        built.append(story)
    words = sum(1 for s in built for se in s["sentences"] for t in se["tokens"] if "g" in t)
    # the library lists texts without loading every token
    index = [
        {k: s[k] for k in ("id", "kind", "level", "series", "chapter", "title") if k in s}
        | {"words": sum(1 for se in s["sentences"] for t in se["tokens"] if "g" in t), "questions": len(s["questions"])}
        for s in sorted(built, key=lambda s: (s["level"], s["kind"] != "story", s.get("series", ""), s.get("chapter", 0), s["id"]))
    ]
    (ROOT / "src" / "data" / "stories-index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    kinds = Counter(n.split("» ", 1)[1].split(":")[0] for n in notes)
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(
        "# Story analysis report\n\n"
        f"{len(built)} texts, {words} analysed words. Decisions taken by a context rule (check a sample):\n\n"
        + "".join(f"- {k}: {v}\n" for k, v in kinds.most_common())
        + "\n## Problems\n\n" + ("".join(f"- {p}\n" for p in problems) or "None.\n")
        + "\n## Decisions\n\n" + "".join(f"- {n}\n" for n in notes),
        encoding="utf-8",
    )
    print(f"{len(built)} texts, {words} words, {len(notes)} context decisions, {len(problems)} problems")
    for p in problems[:60]:
        print("  PROBLEM", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
