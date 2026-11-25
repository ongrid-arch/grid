# VEW-30: the eye view stands on the room's own floor, in its middle

## Outcome

`grid_view kind=eye` for a room on a raised floor (a terrace at +7.5 m, a sunken or stepped room)
puts the eye `eye_height` above that room's own floor: its storey's level plus its floor offset. The
camera stands inside the room, on its middle line, never in a hole or at a far tip, and when the
person gives a point (`stand_at`, [x, y] in metres) it stands there. A point outside the room's
floor is refused, with why.

## Design

- `packages/cli/src/draw/cameraAsk.ts`: `eyeCamera` adds the room's `floorOffset`
  (`roomFloorOffset`) to the storey level, so the eye is measured from the room's own floor.
- `packages/cli/src/draw/views.ts`: `eyeStand` works from the middle of the room (holes respected)
  and steps back along the line of sight only while it stays inside the floor with a margin.
- `packages/cli/src/mcp/readTools.ts`: `grid_view` takes `stand_at` for kind=eye; the point must
  lie in the room's floor; the answer's text says the eye is measured from the room's own floor.
- Decision: no new convention and no new message code: a refusal is plain prose like its
  neighbours.

## Done

- A test on a room raised above its storey on an upper floor: the camera's z is storey level +
  offset + eye height, and the camera stands inside the room.
- A test that `stand_at` stands there and that a point outside the room is refused.
- `tools.test.ts`, `cameraView.test.ts`, `ownWords.test.ts`, typecheck, lint and the scoreboard hold.
