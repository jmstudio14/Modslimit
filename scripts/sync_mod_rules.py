#!/usr/bin/env python3
"""Genera hooks/rules.ts del mod a partir de .claude/router/rules.json.

rules.json es la única fuente de verdad; el mod no puede leerlo en ejecución
(su módulo no tiene Node), así que se copia como código.

    python3 scripts/sync_mod_rules.py           # escribe rules.ts
    python3 scripts/sync_mod_rules.py --check   # sale con 1 si rules.ts está desfasado
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, ".claude", "router", "rules.json")
TARGET = os.path.join(ROOT, "mods", "modslimit-router", "hooks", "rules.ts")

HEADER = (
    "// Generado por scripts/sync_mod_rules.py desde .claude/router/rules.json.\n"
    "// No lo edites a mano: cambia rules.json y vuelve a ejecutar el script.\n"
    "import type { Rules } from './classify.ts'\n\n"
    "export const RULES: Rules = "
)


def render():
    with open(SOURCE, encoding="utf-8") as f:
        rules = json.load(f)
    # Las claves que empiezan por "_" son comentarios (p. ej. "_doc").
    rules = {k: v for k, v in rules.items() if not k.startswith("_")}
    return HEADER + json.dumps(rules, ensure_ascii=False, indent=2) + "\n"


def main(argv):
    expected = render()
    if "--check" in argv:
        try:
            with open(TARGET, encoding="utf-8") as f:
                current = f.read()
        except FileNotFoundError:
            current = None
        if current != expected:
            print("rules.ts está desfasado: ejecuta python3 scripts/sync_mod_rules.py", file=sys.stderr)
            return 1
        return 0
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(expected)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
