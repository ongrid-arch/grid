# CMD-35: four small slips in the command

## Outcome

- `grid init .` ends with `Next: grid check`, never `cd . && grid check`: the folder already is
  where the person stands.
- `grid sheet` with no `--layout` and no drawing option writes the client sheet, as `grid sheet
  --layout client` does. `--layout` stays for `check` and `drawing`.
- A drawing refused for not fitting its paper says what does not fit: the drawing's size, the
  room the paper leaves for it after its margins and title block, and the paper and scale that do.
- `grid diff --out <file.png>` writes the comparison's picture, as `grid draw` and `grid sheet`
  take `--out`. `--picture` still works; naming both is refused.

## Design

- `command/init.ts`: `initText` takes a folder that is `.` (or `./`) as no folder named.
- `sheet/sheetFile.ts`: `checkSheetRequest` reads a missing layout as `client`, and the help and
  usage lines say so. `sheetKindOf` already sends a drawing option to the drawing.
- `sheet/drawingSheet.ts`: `doesNotFit` names the room the drawing area leaves on the paper asked
  for (largest orientation), so a drawing that seems to fit by the paper's size is explained.
- `command/diff.ts`, `command/main.ts`: `--out` joins `--picture`; one name for the file.
- Decision: `--picture` is kept as the older name rather than removed.
- No new convention and no new message code.

## Done

- `init.e2e.test.ts`: `grid init .` prints `Next: grid check`; a named folder still prints its `cd`.
- `sheetOut.test.ts` / `sheet.e2e.test.ts`: `grid sheet` with no layout writes the client sheet.
- `drawingSheet.test.ts`: the refusal names the area left on the paper.
- A diff test: `--out` writes the picture, both options together are refused.
