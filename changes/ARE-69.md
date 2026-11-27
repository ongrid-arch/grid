# 2026-11-27: the brief's totals per use, scoped figures and one-line changes (ARE-69)

## For people

- Say "about 30,000 m² of offices" in the brief and it is measured once, the offices' net area
  together, not office by office. A wish may be for the rooms on one floor or of one department,
  for a room with its en-suite, and for a round room or courtyard by its diameter (ARE-69).
- When many rooms miss a wish the same way, the brief says it once, naming the rooms, instead of
  a line for each (ARE-69).
- Your own door, corridor, turning, step and ceiling figures can be for some rooms, uses, a
  department or the way between two rooms, so a bed-sized door on the ward route no longer misses
  every door in the building. Three more figures of your own: efficiency, homes and storeys. The
  footprint can be measured inside the outside walls (ARE-69).
- Add, remove or change one wish of the brief without writing it all again (ARE-69).

## For agents

- `grid_write_brief`: a room wish takes `total_area`, `total_at_least`, `total_at_most` (m², the
  rooms together, one line "… net area together asked …, drawn … m² in N rooms (…)"), `floor` (id
  or name), `fact` (`name`, `value`), `with_inner` (rooms whose every way in is through the room,
  named "with … inside it") and `diameter` (m, the widest circle it holds). The footprint takes
  `measure` (`outside`, `inside`). `door_width`, `corridor_width`, `turning_circle`, `step` and
  `ceiling_height` take `rooms`, `uses`, `fact` and `routes` (`from`, `to`); a way Grid cannot find
  is an open line "… Grid finds no way along it on one floor …", and the met line ends "for …".
  New figures `efficiency` (%, at least), `homes` and `storeys` (whole numbers; storeys exactly).
  Four or more missed sizes of one wish are one line "N of the M … each drawn …" or "… drawn a to
  b …", with "give total_area …" when the size asked is above twice the largest drawn. Every line
  has `where`, its wish's place (`rooms[2]`, `figures.door_width`, `footprint`, `open[0]`, null for
  a size in a room's name). New arguments `add` (wishes to append, or to replace a footprint, a
  figure or people), `remove` (places) and `update` (`where`, `with`, null takes a field out),
  each without `replace`, refused with `brief`; the answer begins "Changed the brief …". The list of
  figures in an unknown figure's refusal adds efficiency, homes and storeys. No new code in the
  record.
