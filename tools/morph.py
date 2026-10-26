"""Morphology verification shared by ingest.py and validate.py (pymorphy3 + OpenCorpora)."""
from __future__ import annotations

from functools import lru_cache

import pymorphy3

from rulib import fold, strip_stress

CASES = ["nom", "gen", "dat", "acc", "ins", "prep"]
OC_CASE = {"nom": "nomn", "gen": "gent", "dat": "datv", "acc": "accs", "ins": "ablt", "prep": "loct"}
PERSONS = ["1sg", "2sg", "3sg", "1pl", "2pl", "3pl"]
OC_PERSON = {"1sg": {"1per", "sing"}, "2sg": {"2per", "sing"}, "3sg": {"3per", "sing"},
             "1pl": {"1per", "plur"}, "2pl": {"2per", "plur"}, "3pl": {"3per", "plur"}}

SLOTS = {
    "noun": [f"{n}_{c}" for n in ("sg", "pl") for c in CASES] + ["sg_loc2"],
    "verb": ["inf"] + [f"np_{p}" for p in PERSONS] + ["pst_m", "pst_f", "pst_n", "pst_pl", "imp_sg", "imp_pl"],
    "adj": [f"{g}_{c}" for g in ("m", "f", "n", "pl") for c in CASES] + ["m_acc_an", "pl_acc_an",
            "short_m", "short_f", "short_n", "short_pl", "comp", "sup"],
    "other": [],
}
morph = pymorphy3.MorphAnalyzer()
OK_ANALYZERS = {"DictionaryAnalyzer", "HyphenSeparatedParticleAnalyzer"}
POS_GROUP = {"NOUN": "noun", "VERB": "verb", "INFN": "verb", "PRTF": "verb", "PRTS": "verb", "GRND": "verb",
             "ADJF": "adj", "ADJS": "adj", "COMP": "adj"}


def is_dict_parse(p) -> bool:
    return all(type(m[0]).__name__ in OK_ANALYZERS for m in p.methods_stack)


@lru_cache(maxsize=None)
def dparses(word: str):
    return tuple(p for p in morph.parse(word) if is_dict_parse(p))


def group_of(p) -> str:
    return POS_GROUP.get(p.tag.POS, "other")


# --------------------------------------------------------------------------- slot requirements
def slot_requirements(pos: str, slot: str):
    """-> (allowed POS set, list of alternative grammeme sets, check_lemma)."""
    if pos == "noun":
        num, case = slot.split("_")
        if case == "loc2":
            return {"NOUN"}, [{"sing", "loc2"}], True
        g = {"sing" if num == "sg" else "plur"}
        alts = [g | {OC_CASE[case]}]
        if case == "prep":
            alts.append(g | {"loc2"})
        return {"NOUN", "NUMR", "NPRO"}, alts, True
    if pos == "verb":
        if slot == "inf":
            return {"INFN"}, [set()], True
        kind, rest = slot.split("_")
        if kind == "np":
            alts = [OC_PERSON[rest] | {"pres"}, OC_PERSON[rest] | {"futr"}]
            if rest == "3sg":  # impersonal verbs (хо́чется) carry no person grammeme
                alts += [{"Impe", "sing", "pres"}, {"Impe", "sing", "futr"}]
            return {"VERB"}, alts, True
        if kind == "pst":
            g = {"m": {"masc", "sing"}, "f": {"femn", "sing"}, "n": {"neut", "sing"}, "pl": {"plur"}}[rest]
            return {"VERB"}, [g | {"past"}], True
        if kind == "imp":
            return {"VERB"}, [{"sing" if rest == "sg" else "plur", "impr"}], True
    if pos == "adj":
        if slot.startswith("short_"):
            g = {"m": {"masc", "sing"}, "f": {"femn", "sing"}, "n": {"neut", "sing"}, "pl": {"plur"}}[slot[6:]]
            return {"ADJS", "PRTS"}, [g], True
        if slot == "comp":
            return {"COMP"}, [set()], True
        if slot == "sup":
            return {"ADJF"}, [{"Supr"}], False
        g, case = slot.split("_")[0], slot.split("_")[1]
        gg = {"m": {"masc", "sing"}, "f": {"femn", "sing"}, "n": {"neut", "sing"}, "pl": {"plur"}}[g]
        return {"ADJF", "PRTF"}, [gg | {OC_CASE[case]}], True
    raise ValueError(slot)


def verify(form: str, lemma: str, pos: str, slot: str):
    """-> (status, restored_word). status: ok | mismatch | unknown."""
    bare = strip_stress(form).lower()
    ps = dparses(bare)
    if not ps:
        return "unknown", None
    allowed, alts, check_lemma = slot_requirements(pos, slot)
    lfs = lemma_keys(lemma, pos)
    for p in ps:
        if p.tag.POS not in allowed:
            continue
        if check_lemma and p.tag.POS not in ("PRTF", "PRTS") and fold(p.normal_form) not in lfs:
            continue
        if "ё" in bare and "ё" not in p.word:
            continue  # a dataset ё the dictionary spells with е (контролём) is an error, not a variant
        if any(a <= p.tag.grammemes for a in alts):
            return "ok", p.word
    if pos == "noun" and slot == "sg_gen":
        for p in ps:
            if p.tag.POS == "NOUN" and fold(p.normal_form) in lfs and {"sing", "gen2"} <= p.tag.grammemes:
                return "gen2", p.word
    return "mismatch", None


@lru_cache(maxsize=None)
def lemma_keys(lemma: str, pos: str) -> frozenset:
    """The lemma, plus the normal form pymorphy3 gives the lemma itself when that differs:
    сча́стье → счастие, де́ньги → деньга. Only parses of the lemma as a dictionary form count."""
    bare = fold(lemma)
    keys = {bare}
    head = {"noun": ("NOUN", {"nomn"}), "name": ("NOUN", {"nomn"}), "verb": ("INFN", set()), "adj": ("ADJF", {"nomn"})}.get(pos)
    if head:
        for p in dparses(bare):
            if p.tag.POS == head[0] and head[1] <= p.tag.grammemes:
                keys.add(fold(p.normal_form))
    return frozenset(keys)


@lru_cache(maxsize=None)
def lemma_parse(lemma: str, pos: str):
    bare = strip_stress(lemma).lower()
    want = {"noun": {"NOUN"}, "verb": {"INFN"}, "adj": {"ADJF"}}[pos]
    for p in dparses(bare):
        if p.tag.POS in want and fold(p.normal_form) == fold(bare):
            return p
    return None


def preferred(lp, pos: str, slot: str):
    try:
        if pos == "noun":
            num, case = slot.split("_")
            r = lp.inflect({"sing" if num == "sg" else "plur", OC_CASE[case]})
        elif pos == "verb":
            if slot == "inf":
                return lp.word
            kind, rest = slot.split("_")
            if kind == "np":
                r = lp.inflect(OC_PERSON[rest] | {"VERB", "futr" if lp.tag.aspect == "perf" else "pres"})
            elif kind == "pst":
                g = {"m": {"masc", "sing"}, "f": {"femn", "sing"}, "n": {"neut", "sing"}, "pl": {"plur"}}[rest]
                r = lp.inflect(g | {"VERB", "past"})
            else:
                r = lp.inflect({"VERB", "sing" if rest == "sg" else "plur", "impr", "excl"})
        else:
            if slot.startswith("short_"):
                g = {"m": {"masc", "sing"}, "f": {"femn", "sing"}, "n": {"neut", "sing"}, "pl": {"plur"}}[slot[6:]]
                r = lp.inflect({"ADJS"} | g)
            elif slot == "comp":
                r = lp.inflect({"COMP"})
            else:
                g, case = slot.split("_")
                gg = {"m": {"masc", "sing"}, "f": {"femn", "sing"}, "n": {"neut", "sing"}, "pl": {"plur"}}[g]
                r = lp.inflect(gg | {OC_CASE[case]} | ({"inan"} if case == "acc" and g in ("m", "pl") else set()))
        return r.word if r else None
    except (ValueError, KeyError):
        return None


def confirms(form: str, lemma: str, pos: str, slot: str) -> bool:
    """True if pymorphy3 recognises `form` as `slot` of `lemma` (directly or via its own inflection)."""
    status, _ = verify(form, lemma, pos, slot)
    if status in ("ok", "gen2"):
        return True
    lp = lemma_parse(lemma, pos)
    pref = preferred(lp, pos, slot) if lp else None
    return bool(pref) and fold(pref) == fold(form)
