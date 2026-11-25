# 2026-11-25: the plan keeps the name of its rooms text (SHT-14)

## For people

- The name on the `plan "<name>"` line of rooms text is kept in the plan. Sheets are headed with
  it instead of the file's name (`plan`), the IFC project carries it, and reading the plan back
  as rooms text writes the line again (SHT-14).

## For agents

- The plan file has an optional `name`. `grid write` and `grid_write_rooms` set it from the
  `plan` line and leave the file's name when the text has none; `grid describe --as rooms` writes
  it back. Sheet pages and the IFC project use it before the file's name. No new code in the
  record.
