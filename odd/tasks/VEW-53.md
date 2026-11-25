# VEW-53: every room a dividing line borders is open to it

## Outcome
`grid describe` names every room a dividing line borders as open to the rooms on its other side. One line along a row of open bays reads as open to the corridor for each bay, not for the bay at the middle only.

## Design
- `packages/cli/src/describe/facts.ts`: `openSides` took only the pair of rooms at the line's middle. It now lists every pair of rooms that meet along a shared stretch of the line (more than `SHARED_M`), as `neighboursOn` does for walls. The pair at the middle comes first.
- `packages/cli/src/describe/card.ts`: the wall lines list all the pairs of a line, not the first.
- Decision: rooms that share a stretch are paired by their outlines, whichever room names the line, and zones are left out as they are for neighbours.

## Done
- `describe/__tests__/openRow.test.ts`: a corridor and three bays on one line; each bay is open to the corridor in both lengths, and the corridor is next to none of them. It fails before the change.
- describe, ownWords and tolerances tests pass.
