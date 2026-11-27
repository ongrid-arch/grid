# MSG-33: every error found in one refusal

## Outcome

An agent whose call holds several mistakes learns all of them from the one refusal, and mends
them in one more call instead of one call per mistake:

- Rooms text with several independent line errors (a size of 0, a unit Grid cannot read, a room
  that is not there, rooms that overlap) is refused with every one of them, each with its line.
  A line that fails only because a line before it was refused (a room placed north of a room
  that was itself refused) is not listed: it is put right by putting the first one right.
- A tool call that leaves out several required arguments, sends arguments the tool does not
  take, or sends several values the tool cannot read is refused with every one of them at once.
  A call with one mistake is refused in the same words as before.
- `grid_write_brief` lists every fault of a wish, not the first, and a field the brief does not
  take (a misspelt top-level key) no longer throws the whole brief away: the brief is kept and
  the field is listed with the lines it could not keep.

## Design

- Rooms text (`packages/floorplan/src/rooms/everyProblem.ts`, new; the compiler, `compile.ts`,
  is not changed). The compiler stops at the first line it cannot read. When it refuses a text,
  `everyProblem` sets the refused lines aside (each made a blank line, so every line keeps its
  number) and writes the text again, up to a fixed number of rounds, gathering each new problem.
  A new problem is left out, and its line set aside too, when its line, or a line its message
  names, holds the id of a room set aside: it was caused by an earlier failure. Only room, wall,
  door, window, opening and item lines are set aside; a problem on any other line (a `floor`,
  `walls`, `unit` or `end` line, or none) ends the search with what was found, since every line
  after it could read differently. The problems come back in line order. Called once, from
  `writeRoomsIntoProject` (`packages/cli/src/command/write.ts`), the one path `grid write` and
  `grid_write_rooms` refuse through; both already print every problem they are given.
- Tool arguments (`packages/cli/src/mcp/toolkit.ts`, `readArgs`). It gathers every fault in
  one pass (the unknown arguments, each required one missing, each value refused) instead of
  throwing at the first. One fault is refused in its old words; several are refused as one
  sentence saying how many, then one line each. `grid edit` and the reading commands turn the
  same message into their options as before.
- The brief (`packages/cli/src/brief/brief.ts`). Each wish reader collects its faults (fields it
  does not take, each value, level, source and quote) and refuses the wish with all of them,
  joined. In `parseBriefLines`, a top-level field the brief does not take is a refused line of its
  own (`where` the field) and the rest is kept; a top-level fault that leaves nothing to read
  (not an object, a wrong version) still refuses the call. `parseBrief`, which reads the file
  beside the plan, keeps refusing a file with a field it does not take.
- Decision: no new message code. The rooms problems keep their codes, and the tool and brief
  refusals are tool errors, not records.
- Decision: the faults inside a value that a tool reads itself (an object argument's own
  `read`) stay that reader's to word; the brief's reader now lists all of its own.

## Done

- `packages/floorplan/src/rooms/__tests__/everyProblem.test.ts`: a text with a size of 0, an
  unknown unit and an unknown room on independent lines is refused with all three; a room placed
  off a refused room is not listed; overlaps are all listed; a text that writes is unchanged.
  Fails before: the compiler gives the first only.
- `packages/cli/src/mcp/__tests__/everyFault.test.ts`: a call missing two required arguments
  names both; an unknown argument and a bad value are named together; one fault keeps its old
  words; `grid_write_brief` with a wish wrong in two ways names both, and with an unknown
  top-level field keeps the brief and lists the field.
- Existing tests of the rooms write, the toolkit and the brief still pass.
- build, typecheck, lint, vitest on the folders changed, ownWords and contract tests.
