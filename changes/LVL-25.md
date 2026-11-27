# 2026-11-27: rooms numbered per floor, and floors named by their name or level (LVL-25)

## For people

- Rooms text numbers a floor's rooms by its level: `{level}` in a label or a name
  (`repeat guest 6 east as {level}01 ...`) gives 101 to 106 on the first floor, and every copy of
  the floor numbers its own (201 to 206 on the second), with the rooms', doors' and flats' names
  to match. A label that is also a room's id is no longer refused (LVL-25).
- Every floor a tool or a command takes can be named the way people say it: "Second floor", "2",
  "level 2" or "third". A room whose name is on several floors is named with its floor in the
  answers, and comparing plans sums each floor's rooms of a name on their own (LVL-25).

## For agents

- Rooms text: `{level}` or `{floor}` in a room name, a unit's room or opening name, a flat name and
  a `place`/`repeat` label is the floor's level; a label is counted as written, then filled. `copy`,
  `floor ... copy` and `repeat floors` renumber what was numbered by a level (labels, the ids made
  from them, names, flats); a label without one is kept as before. `copy` and `repeat floors from`
  take a floor's name too. `place ... as <label>` no longer refuses a label equal to a room id
  (`<side> of <x>` names the room first).
- `floor` on every tool (and `--floor`) takes a floor's id, name, level (`2`, `level 2`, `L2`,
  `3rd`), a word of its name or an ordinal; the argument is no longer held to an id's letters. A
  word several floors answer to is refused naming them (`tool.floor.among`); the refusal for an
  unknown floor lists the floors' ids in level order, never their names. `grid_find` and `grid_count`
  filter by the floor found.
- A room named by `roomCalled` in an answer (text and `name` fields) says its floor in brackets
  when a room of another floor has its name; `grid_compare`'s `rooms` rows are per name and floor
  then (`Key 122 (Second floor)`). No new code in the record.
