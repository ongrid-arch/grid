# VEW-51: room size lines clear of stairs, doors and labels

## Outcome

A room's width and depth lines (the dashed size lines inside a room) are drawn only where they
cross no stair, lift, door swing or room label. Where a line cannot be drawn clear, it is left out
of the picture; the room's area and name are unchanged and its size is still in `grid_measure`.

## Design

- `packages/viewer/src/picture/sizeLines.ts` holds the crossing tests (a line against a polygon or
  a box) and two filters over the dimension list. It measures nothing: the geometry core still
  says where each line goes.
- `scene.ts` drops a room's size lines that cross a stair flight, a lift's lines or a door swing
  before the labels are placed (so labels have the room to themselves), and then drops those a
  placed room label could not keep off. Other dimensions (overall, wall, opening, grid) are
  untouched.
- Decision: a line is left out, not shortened or moved, because a moved size line no longer
  measures between its two faces.

## Done

- `picture/__tests__/sizeLines.test.ts`: the stair house loses the hall's width line that ran
  over its stair and keeps the other room lines; the crossing tests.
- Type check, lint, the viewer's tests, the scoreboard.
