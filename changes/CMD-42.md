# 2026-11-26: set any field of a part by id, checked by the plan schema (CMD-42)

## For people

- A follow-up change no other tool makes, such as raising a terrace, the height of some walls or
  the level a floor stands at, is one call now, on any host, instead of an edit of the plan file
  by hand: each value is checked against the plan's format and the drawing before anything is
  written, and the answer says what each field was and is now (CMD-42).

## For agents

- New tool `grid_set` (the tool server now lists 45), after `grid_tidy`: `parts` (ids of walls,
  rooms, floors, columns, stairs, ramps, bays or structural grids), `kind` (which kind, when one
  id is used by two), `set` (fields by the plan file's names, each its whole value as the file
  holds it, lengths in metres) and `unset` (field names); `out`, and `based_on` as every change.
  It answers with the receipt every edit gives, a line per field with what it was, and its data's
  `parts` lists each part changed. A value the plan schema refuses is refused naming the part,
  the field and the schema's reason; a misspelt field with the nearest one and the fields the
  kind takes; a field another tool sets (`properties`, `number`, `phase`, a room's `name`, `use`,
  `finishes`, `conditioned`, `boundary` and `holes`, a wall's `thickness`, `start`, `end` and
  `wallType`) with that tool; `id` and the fields Grid writes when it reads a plan are never set.
  A door, window or opening is referred to `grid_change_opening`. No new code in the record.
