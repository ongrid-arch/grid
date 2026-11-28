# 2026-11-28: `void` on a room line in rooms text (LVL-28)

## For people

- Rooms text writes a void: `void` on a room line, after its use or as its use (`room atrium
  "Hall void" void 6 x 8 at 0,0`), makes an atrium, a double-height space, a stair well or a pole
  drop open to the floor below, with no floor, no area and no door needed. It is open to the rooms
  it touches and to the room it is placed beside, with no wall, unless a wall line puts a railing
  or a wall there (LVL-28).
- A void on the lowest floor, or one that also says `outdoor`, `floor <m>` or `conditioned`, is
  refused with what to change, and `grid describe --as rooms` writes `void` on the room's line
  (LVL-28).

## For agents

- `grid_write_rooms` takes `void` on a room line and writes the room with `void: true`; its rooms
  argument and `grid://guide/rooms` have a "voids" topic. The answer says once that a void and the
  room placed beside it are open to each other, and its rooms list the void with `apart: 'void'`.
  The refusals are `rooms/syntax`. No new code in the record.
