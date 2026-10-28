"""El mod no puede leer rules.json en ejecución: rules.ts es una copia generada."""
import importlib.util
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "scripts", "sync_mod_rules.py")

spec = importlib.util.spec_from_file_location("sync_mod_rules", SCRIPT)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class ModRulesSyncTest(unittest.TestCase):
    def test_rules_ts_matches_rules_json(self):
        # Si falla: python3 scripts/sync_mod_rules.py
        self.assertEqual(sync.main(["--check"]), 0)

    def test_generated_file_has_no_doc_keys(self):
        self.assertNotIn('"_doc"', sync.render())


if __name__ == "__main__":
    unittest.main()
