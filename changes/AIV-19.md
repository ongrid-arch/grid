# 2026-11-23: a hosted tool server over HTTP, with the plan's page (AIV-19)

## For people

- `grid mcp --http` (and `grid serve --http`) serves Grid's tools over MCP Streamable HTTP, so a
  chat app such as Claude or ChatGPT can call them by address. It keeps nothing, has no accounts
  and reads no file: each call carries its plan (AIV-19).
- A page that draws the plan floor by floor inside a chat app that shows MCP Apps (AIV-19).

## For agents

- Hosted mode (`--http`, `POST /mcp`): the tools take `plan_json`, the whole plan as the JSON object
  a plan file holds, in place of `plan`, `out` and `plans`; a tool that changes the plan answers
  with the changed plan as `plan_json` (in the data and at the end of the text). Not offered: the
  export, the sheet, `grid_mark_start`, `grid_mark_seen`, `grid_write_brief`, the preview tools,
  `grid_compare`, `grid_diff` and `grid_report_problem`. `grid_write_rooms` takes rooms text alone.
  New tool `grid_show_plan`, and the resource `ui://grid/plan` (`text/html;profile=mcp-app`), linked
  from it and from every changing tool; the drawings come in the result's `_meta` under
  `grid/drawings`. Every answer keeps the label. `grid serve` over standard input and output is
  unchanged. No new code in the record.
