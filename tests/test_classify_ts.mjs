// El clasificador del mod (TypeScript) contra los mismos fixtures que el de Python.
// Node 22.18+ ejecuta .ts sin flags: node --test tests/
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { classify } from '../mods/modslimit-router/hooks/classify.ts'
import { RULES } from '../mods/modslimit-router/hooks/rules.ts'

const { cases } = JSON.parse(
  readFileSync(new URL('./fixtures/prompts.json', import.meta.url), 'utf8'),
)

const promptOf = c => (c.build ? c.build.prefix + c.build.fill.repeat(c.build.times) : c.prompt)

test('cada caso da el mismo nivel que el clasificador Python', () => {
  for (const c of cases) {
    const verdict = classify(promptOf(c), RULES)
    const label = promptOf(c).slice(0, 40)

    assert.equal(verdict.tier, c.tier, label)
    assert.equal(verdict.isForced, c.forced === true, label)
  }
})

test('el prompt largo se mide en caracteres, no en unidades UTF-16', () => {
  const emoji = cases.find(c => c.build?.fill === '😀')
  const prompt = promptOf(emoji)

  // Más de 1500 unidades UTF-16 pero menos de 1500 caracteres.
  assert.ok(prompt.length > RULES.max_prompt_chars_for_haiku)
  assert.ok([...prompt].length < RULES.max_prompt_chars_for_haiku)
  assert.equal(classify(prompt, RULES).tier, 'haiku')
})
