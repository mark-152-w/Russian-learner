"""Shared helpers for Russian text handling in build tools.

Conventions (mirrored in src/lib/ru.ts):
  * Primary stress: U+0301 COMBINING ACUTE ACCENT placed after the vowel (а́).
  * Secondary stress: U+0300 COMBINING GRAVE ACCENT (rare, compounds only).
  * ё is always written as ё and counts as stressed; it never carries U+0301.
"""
from __future__ import annotations

import re
import unicodedata

ACUTE = "́"
GRAVE = "̀"
VOWELS = set("аеёиоуыэюяАЕЁИОУЫЭЮЯ")
CYRILLIC_WORD = re.compile(r"[А-Яа-яЁё́̀]+(?:-[А-Яа-яЁё́̀]+)*")


def from_dataset(s: str) -> str:
    """OpenRussian notation (апостроф after the vowel, ` for secondary) -> combining marks."""
    s = s.replace("'", ACUTE).replace("`", GRAVE)
    # Normalise composed accented letters (e.g. U+00E1 á typed by mistake) into base + mark.
    s = unicodedata.normalize("NFD", s)
    # NFD splits й and ё too; recompose those (they are letters, not stress marks).
    s = s.replace("й", "й").replace("Й", "Й").replace("ё", "ё").replace("Ё", "Ё")
    s = s.replace("ё" + ACUTE, "ё").replace("Ё" + ACUTE, "Ё")
    return s


def strip_stress(s: str) -> str:
    return s.replace(ACUTE, "").replace(GRAVE, "").replace("'", "").replace("`", "")


def fold(s: str) -> str:
    """Comparison key: no stress, lower case, ё -> е."""
    return strip_stress(s).lower().replace("ё", "е")


def syllables(word: str) -> int:
    return sum(1 for ch in word if ch in VOWELS)


def has_stress(word: str) -> bool:
    return ACUTE in word or "ё" in word or "Ё" in word


# Polysyllabic proclitics that are genuinely unstressed in speech (they lean on the next word).
UNSTRESSED_OK = {"из-за", "из-под", "обо", "ото", "передо", "предо", "подо", "безо", "изо"}
# Enclitic particles attached with a hyphen (како́й-то, кто́-нибудь, скажи́-ка): never stressed.
ENCLITICS = {"то", "либо", "нибудь", "ка", "таки", "де", "с"}


def needs_stress(word: str) -> bool:
    """A displayed word needs a stress mark unless it is monosyllabic or an unstressed proclitic."""
    return syllables(word) > 1 and not has_stress(word) and word.lower() not in UNSTRESSED_OK


def missing_stress_parts(word: str) -> list[str]:
    """Parts of a (possibly hyphenated) word that need a stress mark but lack one."""
    if word.lower() in UNSTRESSED_OK:
        return []
    parts = [p for i, p in enumerate(word.split("-")) if not (i > 0 and p.lower() in ENCLITICS)]
    if len(parts) > 1:
        # compounds (кое-что́, ко́ка-ко́ла, се́веро-за́пад): one stressed part is enough
        if any(has_stress(p) for p in parts) or all(syllables(p) <= 1 for p in parts):
            return []
        return [p for p in parts if syllables(p) > 1]
    return [p for p in parts if needs_stress(p)]


def marks_ok(word: str) -> bool:
    """Stress marks only after vowels, at most one primary stress per hyphen part, never on ё."""
    for part in word.split("-"):
        if part.count(ACUTE) > 1 or (ACUTE in part and ("ё" in part or "Ё" in part)):
            return False
    return all(i > 0 and word[i - 1] in VOWELS for i, ch in enumerate(word) if ch in (ACUTE, GRAVE))


def transfer_stress(src: str, dst: str) -> str | None:
    """Put src's stress on the same vowel of dst if both share the vowel skeleton up to that vowel."""
    idx = stress_index(src)
    if idx is None:
        return None
    fs, fd = fold(src), fold(dst)
    # src letters up to and including the stressed vowel must be a prefix of dst
    seen, cut = -1, None
    for i, ch in enumerate(fs):
        if ch in VOWELS:
            seen += 1
            if seen == idx:
                cut = i + 1
                break
    if cut is None or fd[:cut] != fs[:cut]:
        return None
    if "ё" in dst:
        return dst if stress_index(dst) == idx else None
    return dst if syllables(dst) <= 1 else put_stress(dst, idx)


def stress_index(word: str) -> int | None:
    """0-based index (among vowels) of the primary stressed vowel."""
    vi = -1
    for i, ch in enumerate(word):
        if ch in VOWELS:
            vi += 1
            if ch in "ёЁ":
                return vi
            if i + 1 < len(word) and word[i + 1] == ACUTE:
                return vi
    return None


def put_stress(word: str, vowel_index: int) -> str:
    """Place an acute on the given vowel (0-based among vowels) of an unstressed word."""
    out, vi = [], -1
    for ch in word:
        out.append(ch)
        if ch in VOWELS:
            vi += 1
            if vi == vowel_index and ch not in "ёЁ":
                out.append(ACUTE)
    return "".join(out)


def words(text: str) -> list[str]:
    return CYRILLIC_WORD.findall(text)
