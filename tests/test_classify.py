"""Tests del clasificador del router (.claude/router/classify.py)."""
import json
import os
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTER_DIR = os.path.join(ROOT, ".claude", "router")
SCRIPT = os.path.join(ROUTER_DIR, "classify.py")

sys.path.insert(0, ROUTER_DIR)
import classify  # noqa: E402

with open(os.path.join(ROUTER_DIR, "rules.json"), encoding="utf-8") as f:
    RULES = json.load(f)


def tier_of(prompt):
    return classify.classify(prompt, RULES)[0]


def run_hook(stdin):
    return subprocess.run(
        [sys.executable, SCRIPT], input=stdin, capture_output=True, text=True, timeout=10
    )


class ClassifyTest(unittest.TestCase):
    def test_simple_task_goes_to_haiku(self):
        self.assertEqual(tier_of("Renombra la variable x a total"), "haiku")
        self.assertEqual(tier_of("formatea este JSON"), "haiku")

    def test_critical_task_goes_to_opus(self):
        self.assertEqual(tier_of("Diseña la arquitectura del sistema de pagos"), "opus")
        self.assertEqual(tier_of("hay una race condition en el worker"), "opus")

    def test_no_match_uses_default_tier(self):
        self.assertEqual(tier_of("Implementa una función que valide emails"), "sonnet")

    def test_opus_wins_over_haiku(self):
        self.assertEqual(tier_of("renombra el módulo y rediseña la arquitectura"), "opus")

    def test_case_and_accent_insensitive(self):
        self.assertEqual(tier_of("ARQUITECTURA"), "opus")
        self.assertEqual(tier_of("Diseño del sistema"), "opus")
        self.assertEqual(tier_of("Corrige la ortografía"), "haiku")

    def test_manual_overrides(self):
        self.assertEqual(tier_of("!opus arregla este bug"), "opus")
        self.assertEqual(tier_of("!HAIKU diseña la arquitectura"), "haiku")
        self.assertEqual(tier_of("  !sonnet renombra esto"), "sonnet")

    def test_long_prompt_never_goes_to_haiku(self):
        prompt = "renombra " + "x" * RULES["max_prompt_chars_for_haiku"]
        self.assertEqual(tier_of(prompt), "sonnet")

    def test_no_false_positive_on_common_words(self):
        # Regresión: "format" casaba con "información" / "formato".
        self.assertEqual(tier_of("Dame información sobre el formato"), "sonnet")

    def test_reason_lists_matched_keywords(self):
        _, reason = classify.classify("renombra esto", RULES)
        self.assertIn("renombra", reason)


class HookTest(unittest.TestCase):
    def test_emits_tier_and_agent(self):
        res = run_hook(json.dumps({"prompt": "renombra estas variables"}))
        self.assertEqual(res.returncode, 0)
        self.assertTrue(res.stdout.startswith("[router] nivel=haiku"))
        self.assertIn("haiku-simple", res.stdout)

    def test_slash_commands_and_empty_prompts_are_ignored(self):
        for prompt in ("/help", "   /model", "", "   "):
            res = run_hook(json.dumps({"prompt": prompt}))
            self.assertEqual(res.returncode, 0)
            self.assertEqual(res.stdout, "", prompt)

    def test_invalid_input_never_blocks_the_prompt(self):
        for stdin in ("not json", "", "{}"):
            res = run_hook(stdin)
            self.assertEqual(res.returncode, 0, stdin)
            self.assertNotIn("nivel=", res.stdout)


if __name__ == "__main__":
    unittest.main()
