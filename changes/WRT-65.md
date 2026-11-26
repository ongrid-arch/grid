# 2026-11-26: "opens in" and "opens out" on a door between two rooms lead with the room meant (WRT-65)

## For people

- A door between two rooms written `opens out` or `opens in` is refused, because neither room
  is the outside, and the refusal now says how the words are most often meant: `opens out` is out
  of the smaller room (a toilet or a store opens out into the room beside it), `opens in` into
  it, and for two rooms the same size the room named second. That way is offered first. A door
  between two raw rooms, or a raw room and another room, was written opening into the room named
  second without a word; it is refused the same way now (WRT-65).

## For agents

- `grid_write_rooms` and `grid write`: the `rooms/door-side` refusal of `opens in` or
  `opens out` on a `between` door lists its two `fixes` with the likely room first (out of the
  smaller room for `out`, into it for `in`, the room named second for two rooms the same size),
  and its message names that room and why. A `between` door naming a raw room is refused with
  `rooms/door-side` and both fixes where it was written before, and every refusal of a line
  naming a raw room now carries the fixes the line has. No new code in the record.
