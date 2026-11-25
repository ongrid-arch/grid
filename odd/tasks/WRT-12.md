# WRT-12: openings in a comparison, said where they went

## Outcome

After an edit that moves a wall (a room side moved, the building stretched), `grid diff` and
`grid_diff` say of each door and window on that wall that it moved with its wall, how far and
which way on the drawing, and never that it stayed where it was. "Stayed where it was" is kept
for the openings that did not move in the building though their wall changed (a wall made
longer at its other end, a wall that replaced their own). An opening that moved along its wall
because the room it is in moved, as it was, is said to have moved with that room. A door or
window whose wall moved and whose id changed is still paired with itself, by its place along
the paired wall, instead of reading as one removed and one added.

The picture draws only real changes as added: a wall that moved or an opening that was widened
or moved is drawn as changed (amber) at its new place, with its old place outlined in amber,
not as removed under added. What was taken out is red and what is new is green, as before.

## Design

- `packages/floorplan/src/geometry/diff/place.ts`: a third way of pairing openings, after the
  pairing by place in the building and before the pairing by id (after the id pairing for a
  plan written rooms first): an opening with no pair yet is paired with an opening of the same
  type on the wall its own wall was paired with, at the same place along that wall, either
  measured from the matching end (the wall slid) or as its old middle seen from the later wall
  (the wall moved across). The slack is `diffPlace`, as for the pairing by place. No new
  tolerance.
- `packages/floorplan/src/geometry/diff/building.ts`:
  - each paired opening with no change of its own is read by how far its middle moved in the
    building. Under `diffMovement` (1 cm): it stayed where it was, listed in `stayed` when its
    wall moved, grew or was replaced. Further, along its wall with a room that moved by as
    much: it moved with that room. Further, on a wall that moved or was replaced: it moved
    with its wall. These go in a new list, `movedWith` (`opening`, `text`, `with`: `wall` or
    `room`, `by`: the move on the drawing in metres), and the verdict counts them ("2 openings
    moved with their walls"). They are not change lines: they follow from the wall or room
    change, as the id diff marks them derived.
  - `ComparisonMarks` gains `changed: { walls, openings }`: the walls whose ends or thickness
    changed and the openings that changed, by later id. `removed` and `added` hold only what
    was removed and added.
- `packages/viewer/src/picture/comparison.ts`: draws `changed` in the changed colour at the
  later place, filled, and its earlier place outlined, dashed.
- `packages/cli/src/versions/diff.ts`: the text lists the openings that moved with their wall
  or room after the changes, before those that kept their place; the data carries `movedWith`.
  `packages/cli/src/mcp/diffTools.ts` (outside the stated area, two lines): the output schema
  lists `movedWith` and the picture's sentence names changed walls and openings in amber.
- Docs: `docs/commands.md` and `docs/tool-server.md`, the paragraphs on what the comparison says.

Decisions:
- Moved-with openings are their own list, not change lines: a side move of a wall with six
  windows stays one wall line, and the six windows are named as having moved with it, so the
  rooms-first edit still reads as two change lines.
- No new convention, no new message code, no new tolerance.

## Done

- A test that moves the east side of the two-bedroom flat 0.5 m east: both windows on that
  wall moved with it, 0.50 m east, and neither is said to have stayed (fails before).
- A test that stretches the flat 0.5 m north: the entrance door moved with its wall 0.50 m
  north; the windows on the west wall, which grew, stayed where they were (fails before).
- The same side move with the windows under new ids: paired, not removed and added (fails
  before).
- The marks of a wall moved 2 cm and a widened opening: in `changed`, not in `added` (fails
  before); the picture draws them in amber.
- The tool answer: `movedWith` in the data and the section in the text.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run scoreboard`.
