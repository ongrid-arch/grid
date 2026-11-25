# SHT-18: grid_sheet names a drawing sheet and gives it a title

## Outcome
- An agent that calls `grid_sheet` with `layout: drawing` finds out, from the tool's own words,
  that the sheet words it passes (`sheet`) name the project in the drawing's title block, as the
  CLI's `--sheet` does. Before, the argument was described as "Client only" and the agent
  concluded there was nowhere to put the project name.
- The sheet words take a `drawing` field: the title of the drawing in the title block (for
  example "Ground floor, as built"). Left out, the title is Grid's own ("Ground floor plan").
  The CLI, the tool and `<plan>.sheet.json` read it alike. A client sheet ignores it.

## Design
- `packages/floorplan/src/types/sheet.ts`: `drawing` is an optional sheet text of at most
  `NAME_MAX` characters, with the same text rule as the name; it is in the zod schema, the field
  list and the JSON Schema the tool shows.
- `packages/cli/src/sheet/claims.ts`: the title is checked for approval and access claims like
  the headline.
- `packages/cli/src/sheet/drawingSheet.ts`: `DrawingSheetOptions.drawing` replaces the drawing's
  default title; `sheetFile.ts` `makeDrawing` passes `words.drawing`, and the file name of the
  PDF given to the PDF's title uses it.
- `packages/cli/src/mcp/writeTools.ts`: the `sheet` argument and the tool description say the
  words reach a drawing's title block (`name`, `drawing`).
- Decision: the field is called `drawing`, as the title block's own cell is; no new argument on
  the tool, because the words file is already the one place both the CLI and the tool read.

## Done
- A tool call with `layout: drawing` and `sheet: { name, drawing }` writes a drawing whose words
  carry both; the same words in `<plan>.sheet.json` do too; left out, the title is Grid's.
- The `drawing` field is refused when empty, too long or unsafe, and appears in the schema.
- `sheetTool.test.ts`, `sheet.test.ts` (floorplan), `claims.test.ts`, `drawingSheet.test.ts`,
  `ownWords.test.ts` and `tolerances.test.ts` pass; typecheck and lint are clean.
