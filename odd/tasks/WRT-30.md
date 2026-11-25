# WRT-30: a split keeps the outdoor and roofed marks on both halves

## Outcome

- Splitting an outdoor room (a courtyard, a garden, a porch) gives the new room the same
  `outdoor` kind and the same `roofed` mark as the room it came from, so neither half enters the
  net area. The room itself keeps its marks as before.
- A room that is not outdoor splits and answers exactly as before.

## Design

- `packages/cli/src/edit/split.ts`: the new room copies `outdoor` and `roofed` from the room it
  was split from, only when the room states them (C26 says neither is defaulted in the file).
  The new room's `use`, when stated, is its own.
- No new convention: C26 already defines both fields.

## Done

- `packages/cli/src/edit/__tests__/splitOutdoor.test.ts`: a split of an open courtyard leaves both
  halves outdoor and open, a roofed porch leaves both roofed, and a room that is not outdoor gets
  neither field. The test fails without the change.
- ownWords test, typecheck, lint, the cli edit tests, scoreboard.
