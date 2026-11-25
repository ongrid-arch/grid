# ARE-52: one wrong line refuses that line, not the whole brief

## Outcome

An agent that sends `grid_write_brief` a brief with one wrong line (a given wish with no
quote, a number out of range, a figure Grid does not know) gets the other lines written and
the wrong one back: its place, why it was refused and the line as sent, so it can mend that
line and send it again. A brief with nothing valid in it is still refused, naming every line.
A fault in the brief as a whole (not an object, an unknown top-level field, a wrong version)
still refuses the call, as does a file read from disk.

## Design

- `packages/cli/src/brief/brief.ts`: `parseBriefLines(raw, options)` reads each room, touch,
  open and figure wish and the footprint on its own, keeps the ones that read and returns the
  rest as `{ where, problem, line }`. `parseBrief` stays strict and is what the file read uses,
  so a hand-edited file is still refused whole. A line in the person's words is not repeated
  in a refusal's message, only in the `line` Grid returns to the agent that sent it.
- `packages/cli/src/mcp/briefTool.ts`: the tool uses `parseBriefLines`; with at least one
  valid wish it writes the brief and answers with `refused`; with none it refuses and names
  every line. The text and `structuredContent.refused` carry the lines.
- Not changed: the shape faults the input schema already catches stay whole-call refusals
  (they are the call's shape, not a line's content).
- Decision: when the call replaces a brief and some lines are refused, the valid lines
  replace the file; the agent is told which were left out.

## Done

- `packages/cli/src/brief/__tests__/partial.test.ts`: lines read one by one, refused lines
  returned, nothing valid refuses, whole-brief faults still refuse.
- `packages/cli/src/mcp/__tests__/projectTool.test.ts`-style tool test: the brief file holds
  the valid lines and the answer lists the refused one.
- `ownWords`, `tolerances`, `contract`, typecheck, lint, the cli and tool-server tests, scoreboard.
