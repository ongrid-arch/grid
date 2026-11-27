# VEW-83: CSV and XLSX files a spreadsheet reads as they are

## Outcome

A person or an agent writes one of Grid's tables as a file a spreadsheet, a script or a
supplier opens without editing it first:

- `grid_export format=csv|xlsx what=estimate|takeoff|areas|doors|windows|rooms|finishes`
  (`grid export --format csv --what areas`, or `grid export --csv areas`) writes the table into
  `exports/` beside the plan as `<plan>-<what>.csv` or `.xlsx`, or to `out`, so a second revision
  (`out: exports/areas-rev-b.csv`) never replaces the first. The answer's data holds the CSV text
  itself (`csv`), with the path, the table's name and its row count, so a host that shows only the
  structured answer still hands the agent the table.
- Every CSV Grid writes, a file or a tool's `format=csv` answer, has the table's header on line 1
  and the label "General guidance, not your local rules" as its last row, so a spreadsheet or
  `pandas.read_csv` takes the header as the header. The reading tools' `format=csv` answers carry
  the same text as `csv` in their data too.
- A file follows the person's decimal mark: with a decimal comma (the call's `decimal`, else the
  plan's display, else its language) the fields are split by semicolons and the numbers written
  with a comma, as a German or French Excel opens them; lengths are in the units asked for (`units
  mm` writes millimetres, named in the column heads). A CSV file starts with a UTF-8 byte-order
  mark, so Excel reads accents and m² right.
- An XLSX file is one sheet named after the table: the header row bold and frozen, numbers as
  numbers, text as text (never a formula), and the label in the last row.
- Money in an estimate is rounded to its currency's smallest unit (two decimals for EUR, none for
  JPY, two for a currency Grid does not know), in the CSV and the file alike.

## Design

- `packages/cli/src/quantities/units.ts`: `csv()` writes the header first and the label last.
  `labelled` (`mcp/toolkit.ts`) leaves a text whose last line holds the label as it is, so a CSV
  answer is not given a second label line on top.
- `packages/cli/src/export/table.ts` (new, pure): Grid's own CSV read back into a table
  (`readGridCsv`: header, rows, numbers as numbers, the label row set aside), written again in a
  dialect (`tableCsv`: comma and point, or semicolon and comma) and as an XLSX (`tableXlsx`, Office
  Open XML written by hand into the zip writer `distribution/zip.ts` already has: no new
  dependency). Reading the tools' own CSV back means every table is written out by the code that
  already writes it, so nothing here measures anything and the file and the tool's CSV cannot
  differ. A text cell that holds only a number is read as a number, as a spreadsheet opening the
  CSV reads it.
- `packages/cli/src/mcp/tableExport.ts` (new): which reading tool and arguments give each `what`
  (`grid_takeoff for=estimate`, `grid_takeoff`, `grid_areas`, `grid_schedule of=doors|windows|
  rooms|finishes`), run with `format=csv`; the file's name; writing it through `projectFiles`.
  `grid_export` (`writeTools.ts`) takes `what`, `units` and `decimal` for csv and xlsx and calls it;
  `grid export` calls the tool, so the command and the tool write the same file.
- `packages/cli/src/quantities/rates.ts`: the amount column and the total rounded to the
  currency's minor unit (`Intl.NumberFormat`'s digits for an ISO code, else two).
- Decisions: the label moves to the last row in every CSV, not just the files, so the reading
  tools' CSV is the same shape as a file's (MSG-3 still holds: every table carries it). A table
  with `floor all` is refused: the tables take one floor or all floors in one table. The rates are
  the person's `rates.json` beside the plan, as `grid_takeoff` reads it when none is named.

## Done

- `packages/cli/src/export/__tests__/table.test.ts`: reading Grid's CSV back, the two dialects, the
  formula guard, an XLSX unzipped and its sheet read (numbers, text, bold header, label last).
- `packages/cli/src/mcp/__tests__/tableExport.test.ts`: each `what` written as CSV and XLSX into
  `exports/` with its name, `out` keeping two revisions, the CSV in the data, a decimal comma with
  millimetres giving semicolons, refusals (no `what`, `what` with a drawing format, floor all),
  money rounded to the currency.
- `grid export --csv areas` end to end in the command's tests.
- The tests that held the label to the first row of a CSV now hold it to the last.
- `npm run build`, `npm run typecheck`, `npm run lint`, the vitest folders touched, the scoreboard.
