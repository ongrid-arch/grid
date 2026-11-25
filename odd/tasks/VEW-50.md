# VEW-50: section labels sit in clear space

## Outcome
A room's name and height in a section are written in the largest empty part of the room's cut:
clear of the stairs, the seen doors and the slab and wall edges, never over the solid cut, and
on a backing of paper (a halo) so they stay legible on a dark fill. When a room has no clear
place for its words they are left out rather than written over lines.

## Design
- `packages/viewer/src/picture/sectionLabels.ts` (pure): `placeLabel` takes a room's box in metres,
  the size of the words in metres, the solid shapes (the cut, glass, stairs seen beyond) and every
  line drawn (outlines and holes of what lies beyond, edges of the cut and of what was taken). It
  tries a grid of places in the room, rejects a box that crosses a line or lies in a solid, and keeps
  the place farthest from everything (the middle of the largest empty part).
- `section.ts` uses it in place of the room's centre. Two lines (name, height) are tried first, then
  the height alone; the room's name and height are written as before.
- The halo is a second copy of the text under the first, stroked in the paper colour, because the
  PNG renderer ignores `paint-order`.
- Decision: a label with no clear place is left out; the room's data stays in its group's attributes.

## Done
- `packages/viewer/src/picture/__tests__/sectionLabels.test.ts`: place is clear of a stair block,
  a door hole and a slab edge; none when the room is full; a halo under every label.
- `section.test.ts`: on the townhouse no label's box crosses a drawn line or lies on the cut.
- typecheck, lint, viewer tests, scoreboard.
