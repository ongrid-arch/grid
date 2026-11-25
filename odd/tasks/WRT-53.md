# WRT-53: a corner cut-out against a neighbouring room's wall

## Outcome

A room cut out of a corner of another (`inside <room> corner <ne|nw|se|sw>`) closes that corner
with its own walls whichever corner it is in, one against the outside walls or one against a
neighbouring room, and whatever its size. The host's neighbour across the corner is never said
to leave a gap with the host, and is never given a wall as thick as the corner's depth:

- A cupboard 0.90 x 1.00 m cut out of a hall's corner against the living room writes, with no
  gap and no warning, as it does against the outside walls. (WRT-10 already reads the cut-out's
  wall end as wall where the stretch beside it is deeper than the widest wall; this change keeps
  it so with a test of its own.)
- A shallow or small cut-out (a 1.20 x 0.30 m shelf recess, a 0.40 x 0.40 m duct) in a corner
  against a neighbour writes with no `rooms/wall-from-gap` warning naming the host and its
  neighbour, and the plan passes the drawing's own check: every room enclosed, no wall listed
  twice, none standing in a room. Until now the end of the cut-out's wall, seen across the corner,
  was read as a wall between the host and its neighbour as thick as the cut-out's depth plus its
  walls, which warned of a gap that is not there and, for a small cut-out, broke the plan.

## Design

- `packages/floorplan/src/rooms/compile.ts`, where each room face finds the faces across from it
  (the walls between rooms). A stretch of a face with another room within the widest wall was
  taken as a wall to that room before the WRT-10 test for a wall seen end on (`walled`) ran; that
  test ran only for stretches beyond the widest wall. Now a stretch no wider than one wall that the
  two faces of a wall between other rooms cross is taken as that wall's end at any distance, so it
  becomes neither a wall between the face's room and the room beyond, nor a gap. Its end is then
  met by the face's own wall, as every wall end seen end on is.
- Nothing in `placeInside` changes: the cut-out's walls and the host's notch are as they were.
- No new message, code, tolerance or convention.

## Done

- `packages/floorplan/src/rooms/__tests__/cornerCutOut.test.ts`: every corner of a hall between
  a living room and a kitchen, cut-outs of several sizes (the sample plans' cupboard, a shelf
  recess, a duct): no problems, no warnings, the drawing's own check finds nothing, every wall
  as thick as a line states, and the cut-out closed by walls on its open sides. It fails before
  the change for the shallow and small cut-outs.
- The rooms tests, the floorplan package's tests, the type check, the lint, the English-sentence
  count and the tolerance test, and the scoreboard no worse than `scoreboard/current.json`.
