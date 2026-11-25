# VEW-52: a column in a wall is drawn joined to it

## Outcome

A column that stands in a wall is drawn as one outline with the wall. Before, the column's square
and the wall's outline both showed, crossing each other. Now only the outer line of the joined shape
shows, in the working look and the technical one.

## Design

- `packages/viewer/src/picture/scene.ts`, `planScene`: each column is drawn twice. Its outline
  (no fill) goes in a group under the walls; its fill (no outline) goes over them, where it was.
  The wall's fill hides the column's line inside the wall, and the column's fill hides the wall's
  line inside the column. No geometry is computed in the viewer, and the core is not touched.
- Decision: layering rather than a union of outlines, because the viewer computes no geometry and
  the result looks the same. A column of another tone than the wall it stands in shows the seam
  where their fills meet, as two different materials should.

## Done

- `packages/viewer/src/picture/__tests__/columns.test.ts`: the outline is under the walls, the fill
  over them, and neither draws the other's line. It fails before the change.
- Type check, lint, the viewer's tests, `ownWords` and `tolerances` tests, the scoreboard.
