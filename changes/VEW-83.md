# 2026-11-27: CSV and XLSX tables a spreadsheet reads as they are (VEW-83)

## For people

- `grid export --csv areas` (or `--format csv|xlsx --what estimate|takeoff|areas|doors|windows|rooms|finishes`)
  writes one of the plan's tables as a file for a spreadsheet, into `exports/` as
  `<plan>-<what>.csv` or `.xlsx`; `--out` keeps an earlier revision. Every CSV Grid writes now has
  its header on line 1 and the label in its last row. With a decimal comma the fields are split by
  semicolons and numbers written with a comma, lengths in the units asked for; a CSV starts with a
  byte-order mark; an estimate's amounts are rounded to the currency (VEW-83).

## For agents

- `grid_export` takes `format: csv` or `xlsx` with `what` (`estimate`, `takeoff`, `areas`, `doors`,
  `windows`, `rooms`, `finishes`), `units` and `decimal`, and writes the table the reading tool
  gives as CSV (`grid_takeoff`, `grid_areas`, `grid_schedule`). Its answer adds `what`, `columns`,
  `rows`, `separator` and `csv`, the CSV text without its byte-order mark. `what` with a drawing
  format, a drawing option with a table, `floor: all` and a `state` for a table that takes none
  are refused.
- Every `format: csv` answer (`grid_areas`, `grid_takeoff`, `grid_schedule`) has the table's header
  on its first line and the label as its last row, in one cell, and carries the same text as `csv`
  in its data. The estimate's `amount` cells and its total are rounded to the currency's smallest
  unit. No new code in the record.
