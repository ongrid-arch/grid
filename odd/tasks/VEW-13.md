# VEW-13: room labels stay inside their rooms

## Outcome

On any plan picture, sheet or app view, a room's label sits inside that room. When the whole
label does not fit, Grid tries, in turn and still inside the room: turned along a long narrow
room, smaller, the name wrapped on two lines, the name without its area, and last the room's
number alone, with the number and name listed in a room key under the drawing. Only a room
whose number does not fit either gets a leader, and then only a short one: it runs through its
own room and walls, never across another room, to a label that sits outside every room. A
label never sits on a stair's flights or a lift's cross, a wall or a fixture. A room with no
clear spot left at this size is not labelled, as before, and zooming in gives it room.

So a food hall of small stalls, a ward of cubicles or a hotel corridor of equal rooms reads
"1", "2", "3" in the rooms with a key "1–24 Stall", instead of names thrown outside the
building on crossing leaders, landing on the wrong rooms.

## Design

- `packages/viewer/src/canvas2d/labelPlacement.ts`: `placeRoomLabels` tries a list of label
  forms per room (`LabelForm`: its lines, its text size, upright or turned) against the room's
  inside spots, the same clear-of rules as today (other labels, swings, walls, fixtures,
  dimensions when it can). A room's number (`LabelRoom.number`) is the last form. The leader
  stage keeps only spots off every room, within a short reach of the room (`LEADER_REACH_PX`),
  and drops a spot whose leader crosses another room. A placed label records its form, so the
  scene draws what was placed and a test can read its box back (`formBox`).
- Stairs and lifts: the scene passes each flight's outline (the treads) and each lift's cross
  lines as obstacles, so no label sits on them.
- `packages/viewer/src/picture/scene.ts`: draws a placed label as its form says: its lines,
  its size, turned by a quarter so it reads from the bottom; a keyed label as its number, with
  `data-keyed` carrying the room's name. `roomKeyOf` reads the keyed rooms back from the scene.
- The number: the room's own stated number (`number` in the plan, carried on `PlanRoom` by a
  one-line addition in `packages/floorplan/src/geometry/floorplan.ts`), else its place on the
  floor, 1, 2, 3, skipping numbers other rooms state.
- `packages/viewer/src/picture/planSvg.ts` and `writing.ts`: the room key is a band under the
  drawing, rooms of one name together ("1–24 Stall"), heading in Grid's words
  (`drawing.key.rooms` in the message files).
- Decisions: the app view draws the same forms; it has no key band, so a keyed room there
  shows its number and its name on hover as before (zoom in for the name). No halo is added, so
  no label knocks out a wall. A crop's own layout and `--scale` are left for another change.

## Done

- `labelPlacement.test.ts`: a long narrow room gets its name turned inside it; a small room
  gets a smaller label, then its number; a leader never crosses a neighbour and stays short;
  a label never covers a lift's cross or a stair's flight.
- `labelsOnLabPlans.test.ts` on every scoreboard plan: every label (any form) inside its room
  or, with a leader, off every room; no leader crosses another room; leaders are far fewer.
- A picture test: a row of small equal rooms is numbered in the rooms with the key under it.
- Type check, lint, the whole test run and the scoreboard.
