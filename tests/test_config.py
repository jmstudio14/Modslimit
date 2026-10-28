"""Tests de coherencia entre settings.json, rules.json y los subagentes."""
import json
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLAUDE_DIR = os.path.join(ROOT, ".claude")
AGENTS_DIR = os.path.join(CLAUDE_DIR, "agents")
VALID_MODELS = {"haiku", "sonnet", "opus"}


def load_json(*parts):
    with open(os.path.join(CLAUDE_DIR, *parts), encoding="utf-8") as f:
        return json.load(f)


def frontmatter(path):
    with open(path, encoding="utf-8") as f:
        match = re.match(r"^---\n(.*?)\n---\n", f.read(), re.S)
    if not match:
        return {}
    return dict(
        (k.strip(), v.strip())
        for k, v in (line.split(":", 1) for line in match.group(1).splitlines() if ":" in line)
    )


class RulesTest(unittest.TestCase):
    def setUp(self):
        self.rules = load_json("router", "rules.json")
        self.tiers = set(self.rules["tiers"]) | {self.rules["default_tier"]}

    def test_tiers_are_known_models(self):
        self.assertLessEqual(self.tiers, VALID_MODELS)

    def test_overrides_point_to_known_tiers(self):
        for prefix, tier in self.rules["overrides"].items():
            self.assertIn(tier, VALID_MODELS, prefix)

    def test_every_tier_agent_exists(self):
        for tier, cfg in self.rules["tiers"].items():
            path = os.path.join(AGENTS_DIR, cfg["agent"] + ".md")
            self.assertTrue(os.path.isfile(path), f"{tier}: falta {path}")

    def test_keywords_are_non_empty_and_unique(self):
        for tier, cfg in self.rules["tiers"].items():
            kws = cfg["keywords"]
            self.assertTrue(kws, tier)
            self.assertEqual(len(kws), len(set(kws)), f"{tier}: palabras clave duplicadas")


class AgentsTest(unittest.TestCase):
    def test_agents_have_valid_frontmatter(self):
        agents = [f for f in os.listdir(AGENTS_DIR) if f.endswith(".md")]
        self.assertTrue(agents)
        for name in agents:
            meta = frontmatter(os.path.join(AGENTS_DIR, name))
            self.assertEqual(meta.get("name"), name[:-3], name)
            self.assertIn(meta.get("model"), VALID_MODELS, name)
            self.assertTrue(meta.get("description"), name)


class SettingsTest(unittest.TestCase):
    def test_main_model_and_hook(self):
        settings = load_json("settings.json")
        self.assertIn(settings["model"], VALID_MODELS)
        commands = [
            h["command"]
            for entry in settings["hooks"]["UserPromptSubmit"]
            for h in entry["hooks"]
        ]
        self.assertTrue(any("classify.py" in c for c in commands))


if __name__ == "__main__":
    unittest.main()
