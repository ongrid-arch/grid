# 2026-11-26: set facts and room numbers through a tool and rooms text (WRT-74)

## For people

- What the person says about the parts of a plan can be recorded now, without editing the plan
  file by hand: a department, a status, a zone, a head count, a room number. Rooms text writes
  them on a room's line, `number "2.03"`, `dept "ED"` and `facts department=Sales capacity=4`,
  and `grid describe --as rooms` writes them back there, so a plan read back and written again
  shows them (WRT-74).

## For agents

- New tool `grid_set_facts` (the tool server now lists 39), after `grid_tidy`: `set` (facts by
  name: text, a number, true or false), `unset` (names) and `number` (one room's, or `none`), on
  the parts in `parts` (ids of any kind) or picked as `grid_find` picks them (`kind`, `floor`,
  `room`, `where`), both narrowing when both are given; `out`. It answers with what changed on
  which parts and what was so already, and its data's `parts` lists each part changed. A name
  the plan spells otherwise keeps the plan's spelling; a field of Grid's (a room's `name`, `use`,
  `number`, an `area`) is refused with what sets it. A number is refused for several rooms, a
  zone and a number another room shows; stating one that moves Grid's count for other rooms
  writes them the numbers they showed, and `none` that would move them is refused.
- `grid_fields` says how facts are set, in its text and in a new `setBy` field.
- Rooms text: `number`, `dept` and `facts <name>=<value> ...` on a room line; a value in quotes
  is text, one out of quotes a number, yes or no, or text. Refused with `rooms/syntax` in a unit,
  for a fact given twice and for one with no value. No new code in the record.
