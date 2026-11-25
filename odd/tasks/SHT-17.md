# SHT-17: the sheet words file is named after its plan

## Outcome
A folder with two plans gives each its own sheet words. `grid sheet` and `grid_sheet` read
`<plan>.sheet.json` beside the plan (`house.json` reads `house.sheet.json`), the way the brief
and the start markers are kept per plan. One plan's words are never read for another plan, so a
second plan is no longer refused for floors the first plan's words name.

## Design
- `sheetFile.ts`: `sheetFileOf(planFile)` names the file as `briefFileOf` does (name without
  `.json`, then `.sheet.json`). `readSheetWords` reads it when `--sheet` / `sheet` is not given.
- The old shared `sheet.json` is still read, but only for the project's own plan, `plan.json`
  (what `grid init` writes), so existing projects keep working. Any other plan never reads it.
  This is the easiest choice to undo.
- A file named with `--sheet` is unchanged.
- Docs (`docs/commands.md`), help text and the tool description say the new name.

## Done
- Tests: a second plan beside a first one with words ignores `sheet.json`; reads its own
  `<plan>.sheet.json`; `plan.json` still reads `sheet.json`; the refusal names the file read.
- Changelog fragment `changes/SHT-17.md`.
- typecheck, lint, cli tests, ownWords and tolerances tests, scoreboard.
