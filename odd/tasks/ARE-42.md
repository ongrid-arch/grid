# ARE-42: a building total with the floors that could not be measured named

## Outcome

- When a floor's gross figure cannot be worked out, `grid_areas` still gives the total of the
  other floors, under `partial`, with the floors it covers and each floor it leaves out named,
  with the reason. The whole-building `grossInternal` / `grossExternal` stay null: a total that
  looks like the whole building is never given when a floor is missing.
- The text says it in one line: "Gross internal: not known for the whole building. The other 38
  floors add up to 38,968 m²; not measured: floor "f12" (reason), floor "f31" (reason)." Every
  failing floor is listed, so nobody infers the total from a sample of floors.
- A floor that fails for gross internal and one that fails for gross external are listed apart,
  each against its own measure.

## Design

- `packages/cli/src/quantities/areas.ts`: `PlanAreas.partial`, a record per gross measure that is
  null for the building but known on at least one floor: `{ area, floors, unmeasured: [{ floor,
  why }] }`. Worked out from the floors' own figures and `why`, which the library already gives;
  no change to the library. A plan whose figures are all known has no `partial`.
- A note in `notes` says the same in a sentence, so the sheet and estimate readers see it.
- `packages/cli/src/mcp/readTools.ts` (areas answer only): the `partial` field, in the output
  schema and the data, and the "not known" line of the text.
- Decision: the whole-building field stays null rather than carrying the partial sum, so no
  reader that takes the field as the building's total is wrong; the partial is its own field.

## Done

- `quantities/__tests__/partialTotals.test.ts`: a plan of three floors, one of them failing,
  gives the other two's total, names the failing floor with its reason, and keeps the whole total
  null; a plan with every floor measured has no `partial`.
- The tool test of `grid_areas` shows the line and the field.
- typecheck, lint, the cli and floorplan test folders, ownWords and tolerances tests, scoreboard.
