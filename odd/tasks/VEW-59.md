# VEW-59: say when a 3D camera stands inside a wall

## Outcome

A 3D or eye picture whose camera stands inside a wall comes back with a line that says so: which
wall, and a distance (or, for an eye view, a point to stand at) that clears it. A flat grey picture
no longer arrives without a word, so an agent needs no extra calls to find out why.

## Design

- `packages/floorplan/src/geometry/camera.ts`: `cameraInsideWall(plan, camera)` finds the wall on a
  floor the picture shows whose footprint holds the camera's position, with the position between the
  floor's level and the top of its storey. It returns the wall's id and, for a camera that looks
  along a line of sight (not straight down), the distance from the target that stands the camera
  clear of every wall, found by walking out along the bearing to the far face of each wall hit.
  Pure geometry, no tolerance literals.
- `packages/cli/src/mcp/readTools.ts`: `cameraLines` (the lines every 3D and eye answer carries,
  and the saved-view answer's first two) adds one line when the camera is inside a wall. It sits
  after the "It stands ..." line, so a saved view's answer is unchanged.
- Decision: a camera whose floor is cut away is checked against the floors shown only, as the
  picture draws them. A virtual wall is not drawn and is skipped.
- No new message code: the line is part of the answer's text, as the other camera lines are.

## Done

- `geometry/__tests__/camera.test.ts`: a camera inside a wall names it and gives a distance that,
  put back into the record, stands clear; a camera in a room or outside gives none; a floor cut
  away leaves the walls above out; a camera above the storey is not inside.
- `packages/cli/src/mcp/__tests__`: the answer's text carries the line for such a camera.
- Type check of floorplan and cli, lint, `ownWords.test.ts`, `tolerances.test.ts`.
