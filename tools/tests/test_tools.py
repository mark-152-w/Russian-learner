"""Unit tests for the build tools: python3 -m unittest discover -s tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from morph import confirms, verify  # noqa: E402
from rulib import fold, from_dataset, missing_stress_parts, put_stress, stress_index, transfer_stress  # noqa: E402
from validate import Report, check_text, check_token  # noqa: E402


def errors(text, answer=False):
    rep = Report()
    check_text(text, "t", rep, answer=answer)
    return rep.errors, rep.warnings


class RulibTest(unittest.TestCase):
    def test_from_dataset(self):
        self.assertEqual(from_dataset("рука'"), "рука́")
        self.assertEqual(from_dataset("ещё"), "ещё")
        self.assertEqual(from_dataset("ме`жплане'тный"), "мѐжплане́тный")

    def test_fold(self):
        self.assertEqual(fold("Ещё"), "еще")
        self.assertEqual(fold("ру́ку"), "руку")

    def test_stress_index_and_put(self):
        self.assertEqual(stress_index("ру́ку"), 0)
        self.assertEqual(stress_index("идёшь"), 1)
        self.assertEqual(put_stress("города", 2), "города́")

    def test_transfer_stress(self):
        self.assertEqual(transfer_stress("исче́знула", "исчезла"), "исче́зла")
        self.assertEqual(transfer_stress("вы́тащь", "вытащи"), "вы́тащи")
        self.assertIsNone(transfer_stress("предстаёшь", "предстанешь"))  # stem differs before the stress

    def test_missing_stress_parts(self):
        self.assertEqual(missing_stress_parts("какой-то"), ["какой"])
        self.assertEqual(missing_stress_parts("како́й-то"), [])
        self.assertEqual(missing_stress_parts("кто-нибудь"), [])
        self.assertEqual(missing_stress_parts("из-за"), [])


class MorphTest(unittest.TestCase):
    def test_verify(self):
        self.assertEqual(verify("кни́гами", "кни́га", "noun", "pl_ins")[0], "ok")
        self.assertEqual(verify("кни́ги", "кни́га", "noun", "pl_ins")[0], "mismatch")
        self.assertEqual(verify("кникы", "кни́га", "noun", "pl_nom")[0], "unknown")
        self.assertEqual(verify("году́", "год", "noun", "sg_loc2")[0], "ok")

    def test_confirms_impersonal(self):
        self.assertTrue(confirms("захо́чется", "захоте́ться", "verb", "np_3sg"))

    def test_confirms_aspect_forms(self):
        self.assertTrue(confirms("скажу́", "сказа́ть", "verb", "np_1sg"))
        self.assertFalse(confirms("скажу́", "сказа́ть", "verb", "np_3sg"))


class TextRulesTest(unittest.TestCase):
    def test_stress_required(self):
        errs, _ = errors("Я живу в Москве")
        self.assertTrue(any("живу" in e for e in errs))
        self.assertTrue(any("Москве" in e for e in errs))

    def test_monosyllables_and_stressed_ok(self):
        errs, warns = errors("Я живу́ в Москве́, а он — в Ки́еве.")
        self.assertEqual(errs, [])
        self.assertEqual(warns, [])

    def test_yo_required(self):
        errs, _ = errors("Она́ идет домо́й")
        self.assertTrue(any("ё" in e for e in errs))

    def test_strikethrough_skipped(self):
        errs, warns = errors("Write кни́ги, not ~~книгы~~.")
        self.assertEqual(errs, [])
        self.assertEqual(warns, [])

    def test_morpheme_notation_skipped(self):
        errs, _ = errors("пере- means across; the ending -ешь marks ты")
        self.assertEqual(errs, [])

    def test_double_stress(self):
        errs, _ = errors("ру́ка́")
        self.assertTrue(any("more than one" in e for e in errs))

    def test_unknown_word_is_error_in_answers(self):
        errs, _ = errors("кни́гы", answer=True)
        self.assertTrue(any("not in pymorphy3" in e for e in errs))
        errs, warns = errors("кни́гы", answer=False)
        self.assertEqual(errs, [])
        self.assertTrue(warns)


class TokenTest(unittest.TestCase):
    def run_tok(self, tok):
        rep = Report()
        check_token(tok, "t", rep, {"n:книга"})
        return rep.errors

    def test_correct_analysis(self):
        self.assertEqual(self.run_tok({"t": "кни́ги", "lex": "n:книга", "lemma": "кни́га",
                                       "g": {"pos": "noun", "case": "gen", "number": "sg"}}), [])

    def test_wrong_case(self):
        self.assertTrue(self.run_tok({"t": "кни́ги", "lemma": "кни́га", "g": {"pos": "noun", "case": "dat"}}))

    def test_missing_analysis(self):
        self.assertTrue(self.run_tok({"t": "кни́ги"}))

    def test_punctuation_ignored(self):
        self.assertEqual(self.run_tok({"t": ","}), [])


class AbbreviationTest(unittest.TestCase):
    def test_caps_abbreviations_exempt(self):
        errs, warns = errors("the ЙЦУКЕН layout, ТРКИ exams")
        self.assertEqual(errs, [])
        self.assertEqual(warns, [])

    def test_clitic_group(self):
        errs, _ = errors("Его́ там не́ было.")
        self.assertEqual(errs, [])


class DictionaryStressTest(unittest.TestCase):
    def test_wrong_stress_is_caught(self):
        errs, _ = errors("на сто́ле")
        self.assertTrue(any("differs from the dictionary" in e for e in errs))

    def test_either_stress_of_a_homograph_is_fine(self):
        self.assertEqual(errors("ру́ки")[0], [])
        self.assertEqual(errors("руки́")[0], [])


if __name__ == "__main__":
    unittest.main()
