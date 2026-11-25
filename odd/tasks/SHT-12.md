# SHT-12: no approval words in a client sheet's text, and the open access notes on its cover

## Outcome
- A client sheet's headline, intro and floor paragraphs are the author's words. If one says the
  building is accessible, complies, passes or is approved, `grid sheet` and `grid_sheet` refuse the
  words, naming the field and the words found and saying what to write instead. Nothing is written.
  A word inside quotation marks is the author's quoting of someone else and is left alone, as
  everywhere else in Grid.
- When the plan's brief gives the person's own access figures and a door, corridor or turning space
  measures under one, the client sheet's first page says so, in Grid's words, beside the figures.
  The sheet never says "accessible" itself.

## Design
- `packages/cli/src/sheet/claims.ts`: `sheetClaims(words)` lists, per field, the approval words
  (`approvalWords` from `@ongrid/rules`, MSG-3) plus access claims the sheet adds: accessible,
  wheelchair-friendly, barrier-free and "meets/satisfies ... standard". `refuseClaims(words)` throws
  `SheetWordsRefused`.
- It runs in the three places the words enter: `parseSheetWords` callers in `sheetFile.ts`
  (`readSheetWords`), the drawing path and the tool's argument read in `mcp/writeTools.ts`. One
  exported function, `parseSheetWordsChecked`, does the shape check then the claims check, so no
  caller can forget it.
- Open access notes: `sheet/accessNotes.ts` reads the brief beside the plan (`readBrief`), runs
  `accessAnswer` with the person's own figures only (no code figure: none is confirmed for a sheet),
  and keeps each door, corridor and turning space with a short `against`. `makeSheet` passes the
  lines to `sheetPages` (`options.accessNotes`) and the cover prints them in its notes. Rooms are named,
  never by id.
- Decision: refuse, not flag. A client sheet goes to the client; a claim printed above Grid's own
  figures reads as Grid's. Quoted text is exempt, matching MSG-3.
- Messages: `sheet.access.short.*` in `en.ts` and `es.ts` (draft).

## Done
- Tests: a headline "fully accessible", an intro "complies with ...", a floor paragraph with
  "approved" are each refused, in the file reader and the tool; quoted words and ordinary text pass.
- Tests: a plan with a brief figure and a door under it prints the note on the cover page; no brief,
  or all doors enough, prints none.
- typecheck, lint, tests, scoreboard unchanged or better.
