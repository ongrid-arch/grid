# 2026-11-27: finishes for many rooms in one call, per wall face and in height bands (CNT-51)

## For people

- The finishes of a whole plan are set the way a person says them: oak floors in every room but
  the wet rooms, a tiled splashback 600 high behind the kitchen run, tiles to 1.2 m all round the
  shower room, one feature wall, no skirting in the plant room. A band and a feature wall are
  measured on their own and taken off the room's wall finish, so a splashback is priced as the
  splashback, not the kitchen's whole wall face; a room with no skirting is measured with none
  (CNT-51).

## For agents

- New tool `grid_set_finishes` (the tool server now lists 64), after `grid_set_facts`: `rooms`
  (ids, or `all`: every room that is not a zone, a void or outdoor space), `uses`, `floor`,
  `except` (ids or uses; `wet` for bathroom, toilet and utility), `floor_finish`, `wall_finish`,
  `ceiling_finish`, `skirting_finish` (a name, `unset`, or on skirting `none` for no skirting),
  `faces` (wall id to finish, or `unset`), `band` (`finish`, `height`, `from`, and `wall` or
  `behind` an item; replaces the room's band in the same place), `clear_bands`, `out`. Its data's
  `rooms` lists each room changed with its finishes and its bands as measured.
- The plan file: a room's `finishes` may hold `skirting: false`, `faces` and `bands` (C24,
  reopened). `grid_takeoff` gives `bands` and `faces` with their areas, takes them off the walls
  finish in `finishes`, and gives a room with no skirting none; `grid_schedule of=finishes` lists
  each room's bands and faces, says "no skirting", and its CSV has a `bands and faces m2` column.
  `grid_fields`, `grid_find` and `grid_count` take `floor finish`, `wall finish`, `ceiling
  finish`, `skirting finish` (`none` for no skirting) and `band finishes`.
- `grid_rename_room` keeps a room's faces, bands and no skirting when it changes a surface, and
  says to use `grid_set_finishes` for many rooms, a face, a band or no skirting. No new code in the
  record.
