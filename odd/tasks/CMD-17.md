# CMD-17: every tool answer matches its own output schema

## Outcome
A host that checks a tool's answer against the output schema `tools/list` showed (Claude Code
does, strictly) accepts every answer of `grid_check` and `grid_schedule`, whatever the plan and
whichever arguments were passed. An agent no longer sees a schema error after a call with a
country, or after `of=rooms`, `openings`, `doors`, `flats` or `finishes`, and so never drops the
tool or builds a schedule by hand.

## Design
- A test, `packages/cli/src/mcp/__tests__/outputSchemas.test.ts`, calls tool variants through
  the stdio handler on real plans and validates each `structuredContent` against the tool's own
  `outputSchema` as `tools/list` shows it (Ajv, every error reported). It runs `grid_check`
  with and without a country, and `grid_schedule` once for each `of` and for the grouped
  default, and a sweep of the other read tools.
- `grid_check`: `withoutPlace` is only present when no place is stated, so it is optional in
  its schema (a stated country is the common case); `place` is nullable and stays required
  only where it is always sent.
- `grid_schedule`: the schema becomes a `oneOf`-free union by variant: one output schema per
  `of`, chosen by `of` through `anyOf`, each listing only the keys that variant sends, with
  rows typed by that variant. Keys no variant sends are not declared.
- Decision: the answer's data is left as it is; only the schemas move to match it, because
  agents already read these keys.

## Done
- The new test fails before the schema change and passes after.
- `npm run typecheck`, `npm run lint`, `packages/cli` tests, `tools.test.ts`, `contract.test.ts`,
  `npm run scoreboard` unchanged.
