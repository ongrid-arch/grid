# SHT-14: the plan keeps the name its rooms text gives it

## Outcome

- `plan "<name>"` in rooms text is kept in the plan file (`name`), so it is no longer read and
  dropped.
- A client sheet's cover and page lines carry that name, not the file's (`plan`). The file in
  `exports/` is still named after the plan file.
- The IFC project is named by it. The export's file name stays the plan file's name.
- `grid describe --as rooms` writes the `plan "<name>"` line back, so reading and writing again
  loses nothing. A plan with no name reads as before.
- Writing rooms text with no `plan` line keeps the name the file already has.

## Design

- `types/floorplan.ts`: `name`, optional, never defaulted (version 1), a text like the others.
  It is not a convention: a single field, like `projectId`. It is not `title`, which is drawn
  on the picture.
- `command/write.ts`: sets `next.name` from the compiled text's name when it states one; else
  the file's stays.
- `command/describe.ts`: `readRoomsText(plan, { name })` when the plan has one.
- `sheet/pages.ts` callers: the name shown is `words.name`, else `plan.name`, else the file's
  base; the sheet words' own `name` still wins on a client sheet, since the person wrote it for
  that sheet.
- `export/planExport.ts`: the IFC project name is `plan.name`, else the file's.
- `command/planText.ts`: the name is held to the same text limits as other names.
- `sheet/coverage.ts`: `name` placed (shown on the sheet's cover and page lines).

## Done

- Tests: write keeps the name and a second write without a `plan` line keeps it; describe as
  rooms says it; the sheet's pages carry it; the IFC project line holds it.
- typecheck, lint, the touched packages' tests, ownWords, scoreboard.
