# WRT-26: a wall in line with a side is not "at an angle"

## Outcome
Moving a room's side (`grid_move_room_side`, `grid edit side`) no longer refuses because a wall that runs on in line past the room "ends on it at an angle". The walls that meet the side square follow as before; the in-line wall stays where it is. Where no wall across carries the end, the refusal names the in-line wall and says what to do.

## Design
- `packages/cli/src/edit/edits.ts`, `moveRoomSide`: a wall parallel to the side and on its line is set aside as in line instead of being treated as a follower, whose end would be turned off its line. After the walls are gathered, each end of the side that an in-line wall touches must be carried by a following wall; if not, the move is refused naming that wall.
- Decision: no splitting of the wall. A wall that carries the end already makes the move a clean T-joint; with none, a new wall would have to be invented, so Grid names the wall and offers the move instead.

## Done
- `packages/cli/src/edit/__tests__/sideInLine.test.ts`: the move goes through with a wall between the rooms, and is refused by name without one.
- typecheck, lint, the edit and mcp tests, ownWords and tolerances tests, scoreboard.
