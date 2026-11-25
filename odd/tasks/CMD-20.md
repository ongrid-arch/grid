# CMD-20: say what Grid does with a CAD, PDF or picture file

## Outcome

When a command or a tool is handed a DXF, DWG, IFC, PDF, PNG or JPEG file where it wants a plan,
Grid knows the file by its first bytes (never by its name), says what kind of file it is, says
Grid does not read it yet, and says what to do instead. It no longer says "not JSON at line 2"
for a DXF, "unknown word" for a PDF, or "save it as UTF-8" for a picture. A real plan is read as
before.

## Design

- `packages/cli/src/command/planFile.ts`: `foreignFileKind(bytes)` looks at the first bytes and
  answers `dxf`, `dwg`, `ifc`, `pdf`, `png`, `jpeg` or null. Signatures: PNG's eight bytes, JPEG's
  `FF D8 FF`, `%PDF-`, DWG's `AC10` and two digits, IFC's `ISO-10303-21` header, and a DXF's first
  code/value pairs (an optional run of `999` comments, then `0` and `SECTION`, or the binary DXF
  sentinel). Nothing is guessed from the file's name or from text after the first lines.
  `refuseForeignFile(shown, bytes)` throws `PlanRefused` with the message.
- `packages/cli/src/command/plan.ts`: `readText` reads the bytes first (`project.readBytes`, same
  limits and errors as before), refuses a foreign file, then reads the text as before.
  `projectFiles.ts` is not touched. Every command and tool reads a plan through `loadPlan`, so all
  get the same answer.
- Words: `plan.foreign.<kind>` in `messages/en.ts` and a draft in `es.ts`. Each names the file,
  its kind, that Grid does not read it yet, and the way forward: write the rooms as rooms text
  (`grid write`), and for a picture, lay it under the plan as a trace (`referenceImage`).
  Grid's own DXF and IFC exports are mentioned as written, not read back.
- Decision: no new message code in the record (a refusal to read is a thrown `PlanRefused`, as
  its neighbours are), so no catalogue row.
- Docs: a short paragraph in `docs/commands.md` where it says what a plan file is.

## Done

- `packages/cli/src/command/__tests__/foreignFile.test.ts`: each of the six kinds, by bytes with
  a misleading name (`plan.json`), is refused with its words; a UTF-8 plan and a plan with a
  byte-order mark are still read; through `grid check` as a child process.
- Typecheck, lint, the cli and floorplan test folders, `ownWords` and the scoreboard.
