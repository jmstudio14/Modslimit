"""El clasificador Python y los fixtures compartidos con el mod TypeScript."""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTER_DIR = os.path.join(ROOT, ".claude", "router")
FIXTURES = os.path.join(ROOT, "tests", "fixtures", "prompts.json")

sys.path.insert(0, ROUTER_DIR)
import classify  # noqa: E402

with open(os.path.join(ROUTER_DIR, "rules.json"), encoding="utf-8") as f:
    RULES = json.load(f)
with open(FIXTURES, encoding="utf-8") as f:
    CASES = json.load(f)["cases"]


def build_prompt(case):
    if "build" in case:
        b = case["build"]
        return b["prefix"] + b["fill"] * b["times"]
    return case["prompt"]


class FixturesTest(unittest.TestCase):
    def test_every_case_matches_the_expected_tier(self):
        for case in CASES:
            prompt = build_prompt(case)
            tier, reason = classify.classify(prompt, RULES)
            label = prompt[:40]
            self.assertEqual(tier, case["tier"], label)
            self.assertEqual(reason == "override manual", case.get("forced", False), label)

    def test_fixtures_cover_every_tier_and_the_overrides(self):
        self.assertEqual({c["tier"] for c in CASES}, {"haiku", "sonnet", "opus"})
        self.assertTrue(any(c.get("forced") for c in CASES))


if __name__ == "__main__":
    unittest.main()
