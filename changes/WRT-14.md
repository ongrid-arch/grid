# 2026-11-25: the floor line of rooms text, hard to get wrong (WRT-14)

## For people

- A floor line in rooms text needs no name: `floor ground` is a floor named by its id. A name is
  written in quotes; an unquoted one is refused with the line written right, instead of taking
  the next word with it. `elevation=0`, `level: 1` and `Height = 2.7` are read as `elevation 0`
  and so on, and `name "First floor"` gives the name. `level` is the storey number, a whole
  number or a half: `level 2.85` or `level -9ft` is refused with `elevation` offered for a height
  above the ground floor. Every refusal of a floor line shows the whole line,
  `floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [building <kind>] [copy <floor> [with openings]]`,
  and says that the floor-to-floor height is the height below plus the slab above (WRT-14).

## For agents

- `grid_write` and `grid write`: a floor line's name is optional and, when given, in quotes (or
  `name <text>`); an unquoted name, a name that reads as a setting (`"elevation=0"`), a word
  written twice, a word with no value and a level that is a length or neither whole nor a half
  are refused as `rooms/syntax`, each message ending with the whole form of the line and what
  level, elevation, height and slab measure. `key=value`, `key:value`, `key: value` and
  `key = value` are read as `key value` for the floor line's own words. `grid describe --as rooms`
  gives a level that is neither whole nor a half in `raw floor`, which now takes `level`. No new
  code in the record.
