# ARE-39: gross internal area follows the rooms beside each wall

## Outcome

Gross internal area takes off only the walls that face outside now, as the answer to "which
walls face outside" says (rooms beside each wall). A wall that was built as an outside wall
(`kind: exterior`) and now has rooms on both faces, such as the old end wall of a building after
an extension, is counted as floor in gross internal area, not left out. "Built as an outside
wall" stays a fact of the wall (its stated kind): it is no longer the same thing as facing
outside, and the area never reads one as the other.

## Design

- `packages/floorplan/src/geometry/areas.ts`, `outerStretches`: a wall stated `exterior` was
  taken as outside along its whole length. Now it is outside along its length except the
  stretches that have rooms on both faces (longer than `lineInside`), so a wall stated exterior
  with nothing worked out beside it (a bare outline, a wall with no rooms) still bounds the floor.
- `docs/areas.md`: the sentence that lists "walls stated exterior" among what bounds the floor now
  says the stated kind is kept as a fact and the rooms decide which stretch faces outside.
- Decision: the stated kind is not changed or dropped by this; only the area stops reading it as
  facing outside where rooms stand on both sides.

## Done

- A test in `packages/floorplan/src/geometry/__tests__/areas.test.ts`: a wall stated exterior
  between two rooms gives the same gross internal area as the same wall stated as a partition;
  it fails before the change.
- The floorplan and cli test folders, ownWords and tolerances tests, typecheck, lint, scoreboard.
