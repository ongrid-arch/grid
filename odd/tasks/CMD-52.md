# CMD-52: a short tool list, its detail in grid_help, and tool groups

## Outcome

An agent's host reads Grid's tool list on every turn. Today that list is about 740 KB, near
185,000 tokens: every tool's whole description, every argument's every example, the whole
rooms grammar inside `grid_write_rooms`, the brief's whole schema inside `grid_write_brief`, and
an output schema for every answer. A greeting with Grid connected costs far more than one without,
and hosts that defer the tools show the agent their names only. After this change:

- `tools/list` gives each tool short: its description is its first sentence (the "Use this
  when…" one), each argument its type, its allowed values and range, a short first sentence and
  one short example, and an argument that is an object its fields' names and types only. The
  output schema is left out of the list; the answers still carry the same `structuredContent`.
- `grid_help` (new, read-only, listed second, after `grid_project`) gives the rest: with `tool`,
  that tool's whole description, every argument with its whole description and examples, and its
  input and output schemas in full in the data; with no argument, the tool groups and every tool
  with its one line, saying which this server lists.
- `grid mcp --tools write,view,areas,edit` (and `grid serve --tools …`) lists only the tools of
  the groups named, for an app or an agent that needs one part of Grid: `view` the reading,
  pictures, checks, preview, export and sheet; `areas` the areas, quantities, schedules, fields,
  find, count and measure; `write` the plan written from rooms text, the brief, a building, a
  fit-out, the plan's and site's settings and the trace image; `edit` the changes to a plan and
  undo and restore. `grid_project` and `grid_help` are always listed. A group Grid does not know
  is refused, naming the groups.
- A test measures the list: the whole list and each group's are held under a ceiling in tokens
  (counted as four characters a token), so a tool that grows its listed text fails it.

## Design

All in `packages/cli/src/mcp/` and the `serve`/`mcp` commands, with the docs.

- `toolList.ts` (new): `listedDefinition(tool)`, the short form `tools/list` shows, made from
  `toolDefinition(tool)` (unchanged, the full form, which `grid_help` and the tests read)
  mechanically: no tool's own text is edited, so tools other changes add are shortened the same
  way. The first sentence of a text is cut where a sentence ends before a capital letter, and a
  sentence longer than the cap is cut at a word with "…". The caps are lengths of text, not
  measures of a plan, so they live with the list and not in the geometry's tolerance table.
- `toolGroups.ts` (new): the four groups, each tool's group by name, and for a tool named
  nowhere, by its hint (a reading tool `view`, a file written beside the plan `write`, a change
  `edit`), so a tool added by another change lands in a group without editing this file;
  `readToolGroups` reads the option's value.
- `helpTool.ts` (new): `grid_help`. It reads the tools the server lists from the context
  (`ToolContext.listed`, set by `projectTools`), so it says when a tool is not listed and which
  group lists it.
- `serveTools.ts`: `grid_help` after `grid_project`; `serverTool` lists `listedDefinition`;
  `projectTools(project, groups)` keeps the groups' tools.
- `command/main.ts`: `--tools` on `serve` and `mcp`.
- Decision: the output schema is left out of the list rather than shortened. MCP makes it
  optional, the answers' data is the same, and it was a third of the list's size; a host that
  checks answers against it checks nothing now. `grid_help` gives it whole.
- Decision: every tool stays listed by default; the groups are asked for. Cutting the default
  list would break agents that call a tool they know.

## Done

- `__tests__/toolList.test.ts`: the whole list and each group's under their token ceilings; each
  listed tool keeps its name, title, hints, strict input schema with every argument, its types,
  enums and ranges and a "Use this when" first sentence; no output schema is listed.
- `__tests__/helpTool.test.ts`: `grid_help` with a tool gives its whole description and both
  schemas; with none, the groups; a tool not listed by a server started with `--tools` is said
  so, with its group; an unknown tool is refused with the nearest name.
- `--tools` on `grid mcp`: the groups' tools listed, an unknown group refused.
- `tools.test.ts`: the order with `grid_help`; its checks on descriptions read the full form.
- `npm run build`, `npm run typecheck`, `npm run lint`, the vitest folders touched.
