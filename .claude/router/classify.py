#!/usr/bin/env python3
"""Hook UserPromptSubmit: clasifica el prompt en haiku / sonnet / opus.

Lee el JSON del hook por stdin y escribe en stdout una indicación de
enrutamiento que Claude Code añade como contexto del turno. No llama a
ninguna API: la clasificación es local, por palabras clave (coste cero).

Uso manual para probar reglas:
    echo '{"prompt": "renombra estas variables"}' | python3 classify.py
"""
import json
import os
import sys
import unicodedata

RULES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules.json")

INSTRUCTIONS = {
    "haiku": "Tarea SIMPLE. Si es autocontenida, delega en el subagente `{agent}` (Haiku) "
             "pasándole todo el contexto necesario. Si requiere el contexto de esta "
             "conversación o es de una sola línea, hazla tú directamente: delegar costaría más.",
    "sonnet": "Tarea ESTÁNDAR. Resuélvela en la sesión principal (Sonnet). No delegues.",
    "opus": "Tarea CRÍTICA. Delega el diseño/razonamiento en el subagente `{agent}` (Opus) "
            "con un brief completo y aplica tú su plan. Si al revisarla resulta no ser "
            "crítica, trátala como estándar.",
}


def normalize(text):
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def classify(prompt, rules):
    norm = normalize(prompt).strip()

    for prefix, tier in rules.get("overrides", {}).items():
        if norm.startswith(normalize(prefix)):
            return tier, "override manual"

    tiers = rules["tiers"]
    for tier in ("opus", "haiku"):
        cfg = tiers[tier]
        hits = [k for k in cfg["keywords"] if normalize(k) in norm]
        if len(hits) < cfg.get("min_hits", 1):
            continue
        if tier == "haiku" and len(prompt) > rules.get("max_prompt_chars_for_haiku", 10**9):
            continue
        return tier, "coincide: " + ", ".join(hits[:3])

    return rules.get("default_tier", "sonnet"), "sin coincidencias, nivel por defecto"


def main():
    try:
        payload = json.load(sys.stdin)
        with open(RULES_PATH, encoding="utf-8") as f:
            rules = json.load(f)
    except Exception as e:
        # Nunca bloquear el prompt por un fallo del router.
        print(f"[router] desactivado: {e}", file=sys.stderr)
        return 0

    prompt = payload.get("prompt", "")
    if not prompt.strip() or prompt.lstrip().startswith("/"):
        return 0

    tier, reason = classify(prompt, rules)
    agent = rules["tiers"].get(tier, {}).get("agent", "")
    print(f"[router] nivel={tier} ({reason}). " + INSTRUCTIONS[tier].format(agent=agent))
    return 0


if __name__ == "__main__":
    sys.exit(main())
