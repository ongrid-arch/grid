# SHT-16: a drawing sheet's date does not move by itself

## Outcome

The same plan, asked for the same sheet with the same date, gives the same bytes. `grid sheet`
and `grid_sheet` take a date the way `grid export` does (`--date 2026-01-31`, or a time), else
`SOURCE_DATE_EPOCH`, else the clock. The date reaches the title block of a drawing and the
footer of a client or check sheet. A person who pins the date can cache sheets by their content.

## Design

- `sheetFile.ts`: `makeSheet`, `makeDrawing`, `sheetIntoProject` and `drawingIntoProject` take a
  last argument, `date` (text, as given). It is read by `exportTime` (CMD-26), so the forms, the
  refusal wording and `SOURCE_DATE_EPOCH` are the same as for exports. They replace the two
  `new Date()` calls.
- `command/sheet.ts` gets `--date`; `main.ts` passes it; `grid_sheet` gets a `date` argument.
  A malformed date is refused by name before the plan is read, as an export's is.
- Decision: the plan's `written` stamp holds no date and the schema is not changed (a new field
  would change every plan file and needs a convention number). The stamp is not a source here.
  Without an argument or `SOURCE_DATE_EPOCH` the sheet still shows the day it is made.

## Done

- `sheetDate.test.ts`: two sheets and two drawings made with one date are byte-identical PDFs;
  another date differs.
- A bad `--date` is refused by name; `SOURCE_DATE_EPOCH` is honoured.
- typecheck, lint, the cli test folder, ownWords, tolerances and the scoreboard pass.
