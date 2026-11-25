# ARE-28: a dividing line joins two rooms and nothing else

## Outcome

A virtual wall drawn between two rooms (a dividing line) is a way between those two rooms only.
It never counts as a way outside, and never as an open edge onto floor no room claims, along a
stretch where only one of the rooms is beside it: the bit of the line that runs on into the body
of an outside wall, past the end of a narrower room, or merged with other lines along one row.
A ring of corridors round a courtyard, joined at its corners by dividing lines and with no door
out, now gets `no_exit`; a booth in the middle of a hall no longer finds "outside" a few metres
away along a merged line. Only doors, doorless openings and open edges (a virtual wall with a
room on one side only, all along it) lead outside.

A plan written from rooms text ends each dividing line where the two rooms stop sharing an
edge, so the line no longer runs on into the walls it meets.

The route to the outside from a floor above the ground that nothing joins to the floor below
(no stair, lift or ramp) says so: there is no way out from that floor, and why, instead of only
"there is no way".

## Design

- `packages/floorplan/src/geometry/rules/graph.ts`, `floorGraph`: each virtual wall's stretches
  are read first. A wall with two different rooms on its sides along any stretch is a dividing
  line; its stretches with a room on one side only are then no way at all: no exit, no open
  edge, no undrawn floor. Everything that reads ways out goes through `floorGraph` (the check,
  the routes, `describe`, the access measures), so they all follow.
  - Decision: a `beyond` the plan states on the line (C23) is the person's own word and is still
    read on its one-room stretches, as before. Only the unstated, worked-out outside is dropped.
  - Decision: a virtual wall with no stretch between two rooms is an open edge, as CNT-6 made it,
    unchanged: a stand's open front, a terrace edge.
- `packages/floorplan/src/rooms/compile.ts`, `buildWalls`: a virtual wall keeps the ends of the
  edge its two rooms share and is not carried on to the centre line of the wall it meets. Solid
  walls are unchanged. The rooms still close (their outlines are traced from the walls' faces).
- `packages/cli/src/mcp/readTools.ts` (`grid_measure what=route`, to the outside): when no route
  is found and the room's floor is one `floorsWithNoStair` names, the answer says there is no
  way out from that floor because nothing joins it to the floor below, and `answer.noStair`
  carries the floor and the floor a stair would rise from. Words in `messages/en.ts` and `es.ts`.
- No new convention, no new message code.

## Done

- `packages/floorplan/src/geometry/__tests__/dividingLines.test.ts`: the courtyard ring (hand
  drawn with lines run into the walls, and written from rooms text) has no exit and gets
  `no_exit`; a row of booths on a merged line has no exit; a stand's open front still leads out;
  a stated `beyond` on a dividing line is still read; written rooms text ends the lines at the
  shared edge, with the same areas.
- `packages/cli/src/quantities/__tests__/routesAgree.test.ts`: the route from a floor with no
  stair says there is no way out from that floor.
- Type check, lint, the floorplan and cli test folders, `ownWords`, the scoreboard.
