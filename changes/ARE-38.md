# 2026-11-25: a room wish by name counts numbered names and lists the rooms counted (ARE-38)

## For people

- A brief wish for rooms by name, such as three "Consult" rooms, now counts "Consult 1",
  "Consult 2" and the like, and the line says which rooms it counted by name (ARE-38).

## For agents

- `grid_write_brief` and the lines `grid_check` gives for a brief: a room wish by name matches the
  name, or the name followed by a number or one letter ("Consult 1", "Consult-2", "Consult A").
  A name that only contains the stem ("Cat consult") is not counted. A count line ends its
  count with the rooms counted, `drawn 3 (Consult 1, Consult 2, Consult 3)`, at most 12 names.
  The same match serves wishes that two rooms touch. No new code in the record.
