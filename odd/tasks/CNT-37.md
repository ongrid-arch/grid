# CNT-37: fixtures set end to end read as one run

## Outcome

A cooking line of seven pieces standing against each other is one run to `grid_measure what=use`:
the faces where two pieces touch are joined, not "side clearance of nothing", so only the two
ends of the run are measured at their sides. A kind that needs no clear floor beside it (a
kitchen run, a shower) is never held to one. Where one run faces another, the clear floor between
them is said as an aisle, to the run it faces.

## Design

- `geometry/itemKinds.ts`: `ItemKindDefinition.sides` (default true). False for the kitchen run
  and the shower; a kind added from outside keeps the default.
- `geometry/use.ts`, `fixtureSpace`: a side face that every ray finds flush against one fixture
  is joined to it; the ray is followed on past that fixture, so a piece's side is measured
  from the end of the run. A joined side answers `null` and is named in `joined`. A kind
  without `sides` answers `null` on both sides (`sides: false`). `frontBy` names the fixture that
  stops the front, if one does, so an aisle (front stopped by a fixture, not a wall) is known.
- `cli/src/quantities/use.ts`: the `use/space-by-fixture` line leaves out sides that do not count,
  says "joined to <piece>" for a joined side and "an aisle to <piece>" for a front a fixture stops.
- Decision: a piece flush against two others is joined on both sides. Touching is within
  `wallContact`, and every ray along the face must meet the same fixture.

## Done

- `geometry/__tests__/fixtureRuns.test.ts`: seven pieces in a row measure sides only at the ends;
  a gap wider than contact is not joined; a kitchen run and a shower have no sides; facing runs
  give the aisle and name what is across it.
- `quantities` tests still pass; `ownWords` and `tolerances` tests; typecheck, lint, scoreboard.
