# WRT-10: two rooms stacked between two others are not a gap

## Outcome

A person or an agent can write, in rooms text, a row where two small rooms stand one above the
other between two larger rooms: a bedroom, then a toilet over a store, then a living room; or a
WC and a cleaner's store between two offices. The plan is written, with the wall between the two
small rooms, and no `rooms/gap` refusal. Today it is refused: the wall between the two small
rooms leaves a strip, as wide as that wall, where the larger rooms see only each other across the
stack, and the compiler reads that strip as a gap of the stack's width.

The same holds when the strip is the wall between a hall and a WC cut out of its corner
(`inside hall corner ...`) or written as an L-shaped polygon around the WC, with a third room on
the other side.

A real gap is still refused: a strip that no wall between two rooms explains.

## Design

- `packages/floorplan/src/rooms/compile.ts`, `derive`: each edge of each room takes the rooms in
  front of it nearest first; a stretch of the edge whose nearest room is farther than one wall
  and nearer than two outside walls and a wall is reported as `rooms/gap`. The fix: such a
  stretch is not reported when it is no wider than the widest wall and nearer rooms, each across
  a wall from this edge, meet it at both its ends. That stretch is the end of the wall between
  those two nearer rooms (or between a room and itself, round a corner), seen edge-on. The
  stretch still makes no wall of its own between the far rooms; the walls either side of it
  already reach across it.
- Decision: both ends must meet a nearer room across a wall. A stretch at the end of an edge, or
  beside a farther room, is still reported, so a true hole beside a stack is still found.
- Decision: no new message code, no new convention, no change to the tolerances table.
- Nothing outside `packages/floorplan/src/rooms/` changes, except the changelog fragment.

## Done

- `packages/floorplan/src/rooms/__tests__/rooms.test.ts`:
  - the five-line repro (two small rooms stacked between two larger ones) is written with no
    problems, holds a wall between the two small rooms, passes `validatePlan` with no errors, and
    reads back as rooms text and writes again unchanged;
  - the same with a WC cut out of a hall's corner, the hall beside another room;
  - a real gap beside a stack (the stack shorter than the rooms either side) is still refused.
- The tests fail before the change and pass after it.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run scoreboard` pass; the scoreboard is no
  worse.
