# 2026-11-26: a change is never written over a file that is not a plan (CMD-45)

## For people

- A change written to another file (`--out`, `out`, a fit-out's plan) is refused, and nothing is
  written, when that file is `grid.json`, a file Grid keeps beside a plan (now also the
  occupancy figures, `<plan>.occupancy.json`, and the sheet's words, `<plan>.sheet.json`) or
  `firm-standards.json`, or when it is there already and holds no walls, rooms or openings, such
  as `tsconfig.json`. A new file, or another plan, is written as before (CMD-45).
- A plan with nothing in it to draw is no longer drawn as a blank page at hundreds of thousands
  of pixels a metre: `grid draw` refuses it with one line. `grid check` still says it is empty.

## For agents

- Every edit tool given `out`, `grid_tidy` given `out`, `grid_phase_from` and
  `grid_start_fit_out` (with or without `replace`) refuse an `out` or `plan` that is one of Grid's
  own files, or an existing file that is not a JSON object with `walls`, `rooms`, `openings` or a
  `written` stamp: "<file> is not a Grid plan: it holds no walls, rooms or openings, so a plan is
  never written over it. ... Nothing was written." (one of Grid's own files is refused in the words `grid_write_rooms` uses for it)
- `grid_write_rooms` refuses `.occupancy.json`, `.sheet.json` and `firm-standards.json` by name,
  as it refused `grid.json` and the other files beside a plan.
- `grid_view kind=plan` of a plan with no walls, rooms, openings, items, floor outline, site,
  columns, bays or trace image is refused: "<file> holds nothing to draw: ...". `grid_check`
  answers it as before, with `plan/empty`.
- No new code in the record.
