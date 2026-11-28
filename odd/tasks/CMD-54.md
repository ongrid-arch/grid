# CMD-54: try rooms text without writing a plan

## Outcome

An agent learning rooms text, or checking a change before it makes it, can compile the text and
read Grid's whole answer without a plan file being written, logged or left behind:

- `grid_write_rooms` takes `dry_run`: true compiles `rooms` (or `roomsFile`) against the plan as
  it is and answers as the write would (the rooms with their sizes, the guesses and warnings, what
  would change against the plan now, the problems the drawing would have, the brief's lines), says
  first that nothing was written, and writes nothing: no plan file, no change log entry, no
  checkpoint. `dryRun` in the data says which it was.
- `grid write <plan.rooms> --dry-run` does the same from the command line, in text or `--json`.
- Rooms text with problems is refused as a write refuses it, with every problem, so a dry run is
  the way to read the syntax errors of a draft. A text a write would refuse because the plan
  changed since, or would drop floors, is refused the same way, so a dry run that passes is a
  write that passes.
- `dry_run` goes with rooms text only: with `layout`, `scan` or `from` it is refused by name,
  because those write other files beside the plan.

## Design

- `packages/cli/src/command/write.ts`: `writeRoomsIntoProject` takes `dryRun`. It works out
  everything as it does now, on the same plan text, and skips only the one `project.writeFile`
  (and the read-only refusal, which is about writing). The answer's first line says it was a
  dry run against which plan file (`write.dryRun` in the message files). `WriteDone` gains
  `dryRun`. Nothing about a loaded plan changes: the plan it builds is its own.
- `packages/cli/src/command/main.ts`: `--dry-run` on `grid write` (`WRITE_OPTIONS`), refused with
  `--layout`, `--scan` or `--from`; a dry run is not run through `recorded`, so nothing is logged.
- `packages/cli/src/mcp/writeTools.ts`: `dry_run` on `grid_write_rooms` (the name `grid_fill_room`
  already uses for the same thing), refused beside `layout`, `scan` or `from`; `dryRun` in the
  output. The server still holds the plan's lock for the call (it is a change tool) and records
  only when the file changed, so a dry run leaves no entry. No new tool: the tool count stays.
- Docs: `docs/rooms-first.md`, `docs/commands.md` and `docs/tool-server.md` name the option.
- Not done: the compiler (`packages/floorplan/src/rooms/compile.ts`) is not touched.

## Done

- `packages/cli/src/mcp/__tests__/` and `packages/cli/src/command/__tests__/`: a dry run on a
  project with no plan file leaves the folder as it was and answers the rooms; a dry run over a
  plan leaves its bytes and its change log as they were and says what would change; bad text is
  refused with its problems; `dry_run` with `layout` is refused.
- `npm run build`, `npm run typecheck`, `npm run lint`, the test folders changed, the own-words
  and contract tests.
