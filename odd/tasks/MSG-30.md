# MSG-30: say the general-guidance label once where no figure is applied

## Outcome

An agent that reads a plan back, counts parts or asks for a picture is no longer handed the label
"General guidance, not your local rules" as the first line of every answer, so it stops opening
each message to the person with it. The label is still in every answer's data, in every report
that checks or applies a figure, and in the instructions, which now say once why it is there and
when to give it.

## Design

- `packages/cli/src/mcp/toolkit.ts`: `labelled` takes a `leads` flag. `LABEL_SILENT_TOOLS` names
  the tools whose answers apply no figure from a code: `grid_describe`, `grid_view`,
  `grid_compare`, `grid_fields`, `grid_find`, `grid_count`. Their text does not lead with the
  label; their data still carries `label` (the output schema still requires it). Every other tool
  (check, measure, areas, takeoff, schedule, the changes that print check lines) keeps the line.
- `packages/cli/src/mcp/serveTools.ts` passes the tool's name.
- `packages/cli/src/guide/paragraphs.ts`: the shared paragraph on the label says that the answers
  that apply no figure carry the label in their data only, and that the agent gives it when it
  first gives a figure or a check, once, not on every message.
- Decision: pictures keep their caption band and metadata (the files can be passed on alone, which
  is the reason for the label there); only the tool's text is changed. Easiest to undo: empty the set.
- Decision: the report the person runs (`grid check`, `grid write`, `grid edit`) is unchanged.

## Done

- `tools.test.ts`: every tool still has `data.label`; the text leads with the label except for the
  silent set, whose text does not contain it.
- `label.test.ts`, `ownWords.test.ts`, `tolerances.test.ts` and the tool-server tests pass.
- `changes/MSG-30.md` carries the entry for people and agents.
