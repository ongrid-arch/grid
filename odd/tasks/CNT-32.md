# CNT-32: a curved wall placed by its face stays where it was taped, and its corners are corners

## Outcome

- A curved wall placed by its face (`face` with `arc`) is written back by the same face round its
  own curve: each end moved along its radius, as it was read. Before, every write of Grid's
  reading (`grid write`, a change to a plan with named types, the rooms text's `raw wall` lines,
  the work of a plan with phases) moved the face line square to the chord, so the wall's ends left
  its circle. A bow-fronted room placed by its inside faces then came back with its curve off its
  ends (`wall/arc-ends-apart`) and its outline crossing itself, the room turned inside out. Read
  and written any number of times, it now reads as it was taped.
- A taped corner where a straight wall meets a curved one is a corner: it is worked out where the
  straight wall's inside face crosses the curve's inside face, the outline's corner there, and set
  against the drawing as any other. So is a corner of two curved walls. Before, every corner on a
  curved wall was said to be no corner of the room.
- Where the two walls meet at two corners of the room (a half-round bay closed by one straight
  wall), the pair's order chooses: going round the room counter-clockwise, the corner where the
  first wall's face gives way to the second's. When that does not settle it, it is still said to
  be no corner, as before.
- A taped side along a curved wall counts only the outline along that wall's own stretch of its
  circle. Before, a straight side of the room whose two corners happened to lie on the curve's
  circle was counted in it too.

## Design

- `packages/floorplan/src/types/floorplan.ts`: `statedWall` passes the wall's arc (`arcOf`) to
  `faceFromCentre`, as the reading (`centreFromFace`) and `wallWithEnds` already do. One line;
  every writer of a reading goes through it.
- `packages/floorplan/src/geometry/taped.ts`:
  - a room's face of a wall is a line for a straight wall and a circle for a curved one
    (`roomFaceOf`), the circle's radius worked out as the side measure already did;
  - `sideRound` keeps only the outline edges whose two ends lie on the circle within the wall's
    sweep (`onSweep`, read from `wallCurve`), so a chord of the circle elsewhere in the room is not
    the wall's;
  - a corner is looked for at every point where the two faces cross: line and line as before,
    line and circle, circle and circle. The outline's point nearest one of them, within
    `chainPoint`, is the corner. With two such points, the one where the edge before it lies on
    the first wall's face and the edge after on the second's is taken; otherwise none.
  - a wall named twice in a corner (`['c', 'c']`) still makes no corner.
- No new tolerance, message, code or convention: the corner and its words are those of a
  straight corner. A straight corner is found as before (one crossing point, so no change).
- Docs: `docs/plan-file.md`, the paragraph on a wall placed by its face (a curved one) and the
  table of taped lengths (a corner on a curve, the pair's order). Changelog fragment
  `changes/CNT-32.md`.
- Out of this change: the edits of straight walls placed by their face (another change is on
  them), and `packages/cli/src/edit/`.

## Done

- `packages/floorplan/src/geometry/__tests__/curvedFace.test.ts`, failing before the change:
  - a bow-fronted room (three straight walls and an outward bow, every wall placed by its inside
    face) read, written back through `statedWall` and read again three times keeps its ends, its
    area (within 0.1% of the hand figure) and no issue; walked either way round; the same for a
    bow into the room and for a half-round bay;
  - a whole round room placed by its face, written back and read again, keeps its taped radius;
  - taped corners from a straight wall to the bow agree with the hand figure, both ways round the
    room; a diagonal from a straight corner to a corner on the curve agrees;
  - a half-round bay closed by one straight wall: the corner `[W, S]` and `[S, W]` are its two
    different ends, and the length between them is the bay's width;
  - a taped side along the bow counts only the curve, in a room whose other corners lie on the
    curve's circle.
- The existing curved-wall and survey tests pass unchanged
  (`curvedWalls.test.ts`, `survey.test.ts`, `packages/cli/src/taped/__tests__/taped.test.ts`).
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, the CLI's taped and
  own-words tests, the tolerances test, and `npm run scoreboard` no worse than `current.json`.
