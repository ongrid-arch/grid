# MSG-28: say when an opening moved to another wall

## Outcome

- A door or window moved from one wall to another reads as that in `grid diff`, `grid_diff` and
  the comparison: its change line says it moved from one wall to the other and names what lies on
  each side of each wall, the rooms by name and "outside" for the outside. It no longer reads as
  "moved 1.65 m along its wall", a distance along two different walls that means nothing, and its
  hinge and swing are not compared across the two walls, whose directions differ.
- `grid_change_opening` (and `grid edit opening`) moving an opening to another side of a room says
  what lies on each side of its new wall, and what lay on each side of its old one: it no longer
  says the window is still between the bedroom and outside after it went to an inside wall.
- The id comparison's own summary of an opening on another wall (`moved to another wall`) no
  longer adds a distance along its wall.

## Design

- `packages/floorplan/src/geometry/diff/building.ts`, the opening lines: an opening in both
  versions is on another wall when its wall in the later version is not the one it had (walls
  paired by place first, MSG-27) and that is no replaced wall: its old wall still stands in the
  later version, or its new wall stood in the earlier one. A wall replaced under another id, with
  the opening on it, is left to the words it has now (stayed where it was, moved with its wall).
  Such an opening's line gives its other changes (type, size, kind, phase) and then the move, with
  both walls' ids and both sides of each, from `openingFaces` as the rooms an opening is in come
  already. Its `rooms` are the rooms on its new wall and those on its old wall still in the plan.
- Words in the message files, `en.ts` and `es.ts`: `diff.opening.otherWall` and
  `diff.opening.sides` (and `diff.opening.side.outside`, `diff.opening.side.none`) for the line,
  `edit.opening.otherWall` for the edit's answer.
- `packages/floorplan/src/geometry/diff/summary.ts`: an opening whose `wall` changed says it moved
  to another wall and leaves out the distance along it.
- `packages/cli/src/mcp/writeTools.ts`, `grid_change_opening`: the "It is between" line reads the
  plan after the change, not before; moved to another wall it says both walls' sides.
- No new tolerance, code, field or convention.

## Done

- Tests in `packages/floorplan/src/geometry/__tests__/diff-other-wall.test.ts`: a window moved
  from an outside wall to an inside wall reads as moved from one wall to the other with outside
  and the rooms named, never "along its wall"; a door moved to another wall says so with no hinge
  or swing words; a window that slid along its wall still reads as before; the id summary has no
  distance along a wall for an opening on another wall.
- A test in `packages/cli/src/edit/__tests__/` that `grid_change_opening` moving a door to another
  side of a room names what lies on each side of its new wall and of its old one.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, `ownWords.test.ts`,
  `tolerances.test.ts`, the contract test and `npm run scoreboard`.
