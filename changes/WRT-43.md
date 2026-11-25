# 2026-11-25: a room with no name is drawn and measured by its id (WRT-43)

## For people

- A room with no name is no longer left out of every drawing, measure and export. A room whose
  name is missing, or is not text, is read with its id as its name, and `grid check` says so once
  for that room. A room with a blank name is labelled on the drawing with its id, and the
  measuring answers (the schedule, the take-off, the finishes, the accessibility measurements and
  the others) call it by its id instead of `""` (WRT-43).

## For agents

- A room whose `name` is missing, `null` or not text was `plan/part-left-out` and in no view or
  measure. It is now read with its id as its name, under `plan/value-left-out` with the id as the
  value used (`fix`: write the name, or leave it out to keep the id). A command that writes the
  plan still reads it whole and refuses it with that line. A blank name (`""`) is read as written.
- The drawing labels a room with a blank name with its id; `grid_schedule`, `grid_takeoff`,
  `grid_measure` (rooms, access, use, fit, route, facing, sun) and the estimate name such a room by
  its id, never as `""`, and their `name` fields carry the id too. `grid_view`'s list of nearest
  rooms marks a room with no name `(no name)`.
- `grid_view` with `crop`, or with `room` for `kind=eye` or `kind=3d`, that names a room in no view
  now refuses by saying why: `names room "<id>", which was left out when the plan was read: <the
  reader's fault>`, or `which cannot be drawn: <the check line> (<code>)`. It said the plan had no
  such room before.
- No new code in the record.
