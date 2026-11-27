# 2026-11-27: a short tool list, grid_help, and tool groups for grid mcp (CMD-52)

## For people

- Grid costs an agent far less to keep connected: the tool list its host reads on every turn is about a fifth of what it was (about 39,000 tokens where it was about 185,000), and `grid mcp --tools view,areas,write,edit` lists only the groups an app needs, `view` alone about 7,900 tokens. The detail the list leaves out is one call away, in the new `grid_help` (CMD-52).

## For agents

- `tools/list` gives each tool short: its title and hints, the first sentence of its description (the "Use this when…" one), and each argument's name, type, allowed values and range, a short first sentence and, for text, a list or an object, one short example; an object argument lists its fields' names and types only. Arguments many tools share (`plan`, `out`, `decimal`, `whole`, `page`, `language`, `based_on`, `who`) get a shorter line. No output schema is listed; every answer's `structuredContent` is as before.
- New tool `grid_help` (read-only, second in the list, after `grid_project`): with `tool`, that tool whole: its description, every argument with its description and examples, and `tool.input_schema` and `tool.output_schema` in the data; with no `tool`, `groups` and every tool (`tools`, each with its `group` and whether this server lists it). `listed_groups` is null when every group is listed. A tool name Grid does not have is refused with the nearest. Pass `whole: true` for a long tool, such as `grid_write_rooms`.
- `grid mcp --tools <groups>` and `grid serve --tools <groups>`: `view`, `areas`, `write` and `edit`, split at commas; `grid_project` and `grid_help` are always listed. An unknown group is refused, naming the four. `grid_help` says which group lists a tool the server does not.
- The tool server lists 67 tools. No new code in the record.
