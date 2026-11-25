# ARE-34: a room whose inside faces form a rectangle is read as a rectangle

## Outcome

- A room whose inside faces form a rectangle is read as a rectangle with four corners, and keeps
  its size across by up (its W x D), whatever the kinds and thicknesses of its walls. That holds
  for a side that runs partly along an outside wall and partly along an inside wall.
- Today such a side often gets a step a twentieth of a millimetre deep where the two walls meet.
  A plan file holds a wall's centre line to a tenth of a millimetre, and an inside wall of 4.5 in
  (half of it 57.15 mm) cannot have its face exactly where an outside wall's face is. The step
  gives the outline six corners instead of four, so `grid describe` writes the room `~W x D`
  (not a rectangle), `grid_areas` gives it no size and the rooms read-back writes it as a
  `polygon` with six corners. In feet plans it happens to most rooms that touch both kinds of wall.
- Afterwards those rooms are rectangles everywhere their shape is read: the description, the
  areas' room sizes, the measures and the rooms read-back (`W x D at x,y`).
- A real step between two faces in a row (a thick wall carrying on as a thin one, a few
  millimetres or more) is traced as before.

## Design

- `packages/floorplan/src/geometry/tolerances.ts`: a new entry, `flushFaces`, 0.0002 m. Two
  pieces that two walls' rounding puts up to a tenth of a millimetre apart each way are within it
  with room to spare, and a step anyone draws (a millimetre or more) is not. `sameFace` keeps its
  value: the wall joints, the flats and the roof lines read it and are not part of this change.
  `docs/tolerances.md` gets its row, as the tolerances test asks.
- `packages/floorplan/src/geometry/room.ts`, `traceRing` step 4: neighbouring pieces in a row whose
  inner faces are within `flushFaces` of each other show the room one face, as pieces on exactly
  one line do today. The group's first face stands for the side, as before. No step is made
  between them, so no floor worth naming is lost or counted twice (at most 0.2 mm by the side).
- Why in the tracing and not in each reader: every reader of a room's shape (`describe/facts.ts`,
  `quantities/measure.ts`, `rooms/read.ts`, `rooms/compile.ts` for raw rooms) counts the outline's
  corners. Fixing the outline once fixes them all, and no reader needs a rule of its own.
- Why not in the writing (`rooms/compile.ts`): a plan file holds centre lines to 0.1 mm, so a face
  of a wall whose half thickness is not on that grid can never be flush with another's. Plans
  already written (and plans written by hand or by other tools) have the same hair-wide offsets.
- No new convention and no new message code.

## Done

- `packages/floorplan/src/geometry/__tests__/room-flush-faces.test.ts`:
  - a room whose south side runs along an outside wall and an inside wall whose faces are
    0.05 mm apart has a four-corner outline and its full W x D, in either order of the walls;
  - a feet plan written from rooms text (outside 6.5 in, inside 3.5 in, a room beside a deeper
    one) gives every room four corners;
  - a step of 1 mm between two faces in a row is still traced as a step (six corners).
- `packages/floorplan/src/rooms/__tests__`: the same feet plan read back as rooms text writes each
  room as `W x D at`, not `polygon`.
- `packages/cli`: `grid describe --for agent` of that plan writes no room with `~`.
- `npm run typecheck`, `npm run lint`, the test folders of `packages/floorplan` and
  `packages/cli`, `ownWords.test.ts`, `tolerances.test.ts` and `npm run scoreboard` (no count
  worse than `scoreboard/current.json`).
