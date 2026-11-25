# 2026-11-25: a room line's refusal names every word it takes, and the one meant (WRT-35)

## For people

- A word a room line does not take, such as `level 0.6` for a terrace that stands higher, is
  refused with every word a room line takes, `floor <m>` (the room's floor above or below its
  storey's) and `height <m>` (its own ceiling) among them, and the word most likely meant with its
  value: "Did you mean 'floor 0.6'?". A slip (`hieght 3`) is answered the same way (WRT-35).

## For agents

- `grid_write_rooms` and `grid write`: the `rooms/syntax` refusal of a word a room line does not
  understand now lists `floor <m>`, `height <m>`, `wall <t> [kind]` and `first-wall <wall id>`
  with the other room-line words, and adds "Did you mean '<word> <value>'?" when a word is likely
  meant: `level`, `elevation` and `offset` are `floor`, `ceiling` and `headroom` are `height`,
  `thickness` is `walls`, and a near spelling of any room-line word is that word. No new code in
  the record.
