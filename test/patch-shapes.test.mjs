/**
 * Patch-file shape tests for dsh-plugin-toggle.
 *
 * A profile's `cordis.patch.yml` is a top-level YAML array of loader patch
 * entries. `AGENTS.md` requires three shapes: `[]`, `[...]` and a bare list
 * (`- item` lines). Every shape must stay parseable after a toggle — an
 * unparseable patch file makes DSH fail to boot with
 * "failed to parse overlay <file>".
 *
 * The flow-style case (`[{ ... }]`) is the regression this suite exists for:
 * a flow sequence cannot contain a block node, so appending a block
 * `- id: x` line inside it yields a file no YAML parser accepts.
 *
 * Scope note: byte-exact round-trip for CRLF files and trailing-newline
 * fidelity are asserted only for the shapes this change touches (flow arrays).
 * Line-ending / trailing-whitespace preservation for the remaining shapes is
 * tracked separately and deliberately not asserted here.
 *
 * Run:  node test/patch-shapes.test.mjs
 * The `yaml` package is resolved from the host install; if unavailable the
 * parse assertions are skipped with a notice.
 */
import { createRequire } from 'node:module'
import { addDisable, removeDisable } from '../lib/index.js'

const require = createRequire(import.meta.url)
let YAML = null
for (const name of ['yaml', 'js-yaml']) {
  try {
    YAML = require(name)
    break
  } catch {
    /* try the next one */
  }
}
if (!YAML) console.log('notice: no YAML parser resolvable; parse assertions skipped')

function parseState(text) {
  if (!YAML) return { known: false }
  try {
    return { known: true, ok: true, isArray: Array.isArray(YAML.parse(text)) }
  } catch (error) {
    return { known: true, ok: false, isArray: false, message: String(error.message) }
  }
}

// `roundTrip: true` marks the shapes whose byte-exact round-trip this change
// guarantees (flow arrays). Others only have to stay parseable.
const cases = [
  { name: 'empty array (LF)', text: '[]\n' },
  { name: 'empty array (no trailing newline)', text: '[]' },
  { name: 'empty array (CRLF)', text: '[]\r\n' },
  { name: 'comments above an empty array', text: '# keep me\n[]\n' },
  { name: 'flow array, single line', text: '[{ insert: [{ id: a, name: b }] }]\n', roundTrip: true },
  { name: 'flow array, multi line (LF)', text: '[\n  { insert: [{ id: a, name: b }] }\n]\n', roundTrip: true },
  { name: 'flow array, multi line (CRLF)', text: '[\r\n  { insert: [{ id: a, name: b }] }\r\n]\r\n', roundTrip: true },
  { name: 'flow array, multi line, no trailing newline', text: '[\r\n  { insert: [{ id: a, name: b }] }\r\n]', roundTrip: true },
  { name: 'flow array, two existing entries', text: '[\n  { id: a, name: b },\n  { id: c, name: d }\n]\n', roundTrip: true },
  { name: 'bare list (LF)', text: '- id: a\n  name: b\n' },
  { name: 'bare list (CRLF)', text: '- id: a\r\n  name: b\r\n' },
  { name: 'bare list with trailing blank line', text: '- id: a\r\n  name: b\r\n\r\n' },
  { name: 'bare list, no trailing newline', text: '- id: a\r\n  name: b' },
  { name: 'comments above a bare list', text: '# comment\r\n- insert:\r\n    - id: a\r\n      name: b\r\n' },
]

let failed = 0
let parsed = 0

for (const { name, text, roundTrip } of cases) {
  const added = addDisable(text, 'a')

  // 1) the toggle must not corrupt the file: still a parseable top-level array
  const state = parseState(added)
  if (state.known) {
    parsed += 1
    if (!(state.ok && state.isArray)) {
      failed += 1
      console.log(`FAIL  ${name}\n      addDisable produced YAML that does not parse as an array: ${state.message}\n      got: ${JSON.stringify(added)}`)
      continue
    }
  }

  // 2) the disable entry must be discoverable again (toggle stays idempotent)
  if (!added.includes('disabled: true')) {
    failed += 1
    console.log(`FAIL  ${name}\n      disable entry missing from output: ${JSON.stringify(added)}`)
    continue
  }

  // 3) byte-exact round-trip, for the shapes this change guarantees
  if (roundTrip) {
    const back = removeDisable(added, 'a')
    if (back !== text) {
      failed += 1
      console.log(`FAIL  ${name}\n      round-trip differs\n      original: ${JSON.stringify(text)}\n      after:    ${JSON.stringify(back)}`)
      continue
    }
  }

  console.log(`ok    ${name}`)
}

console.log(`\n${cases.length - failed}/${cases.length} shapes passed`
  + (YAML ? `  (parse asserted on ${parsed})` : '  (parse not asserted)'))
if (failed > 0) {
  console.error(`${failed} failing`)
  process.exit(1)
}
