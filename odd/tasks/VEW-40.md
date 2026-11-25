# VEW-40: describe leaves out a line whose list is empty

## Outcome
`grid describe`, in every length and for a person or an agent, never prints a line with nothing
in its list. A plan that states its north and kind of building and has nothing else unsaid gets no
"Not in the plan: ." line (person) and no bare `NOT IN PLAN` line (agent).

## Design
- `packages/cli/src/describe/card.ts`: `personCard` and `agentCard` add the unsaid line only when
  `unsaid(...)` returns items.
- Other lines in the card are already built from lists that are checked first; a test walks the
  describe output for a plan with nothing unsaid and finds no line ending in `: .` or a bare key.

## Done
- A test in `packages/cli/src/describe/__tests__/describe.test.ts`: a plan with nothing unsaid prints no
  unsaid line in person and agent form, in each length; a plan with something unsaid still does.
- ownWords, tolerances, describe tests, typecheck, lint pass.
