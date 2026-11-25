# 2026-11-25: the sheet words are kept per plan (SHT-17)

## For people

- A client sheet reads its words from `<plan>.sheet.json` beside the plan (`house.json` reads
  `house.sheet.json`), the way the brief is kept, so a second plan in the folder no longer
  reads the first plan's words and gets its own sheet. `plan.json` still reads an older
  `sheet.json`; any other plan ignores it (SHT-17).

## For agents

- `grid_sheet` and `grid sheet` read `<plan>.sheet.json` beside the plan when no sheet is
  given. `sheet.json` is read only for `plan.json`. A file named with `sheet` / `--sheet` is
  unchanged. No new code in the record.
