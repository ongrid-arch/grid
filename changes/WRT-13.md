# 2026-11-25: a plan is told by what it holds, and Grid's own files are never written as one (WRT-13)

## For people

- `grid write` (rooms text, `--layout` and `--scan`) refuses to write a plan into `grid.json` or
  into a file Grid keeps beside a plan (`<plan>.markers.json`, `.seen.json`, `.brief.json`,
  `.preview.json`, `.scan.json`), and into any JSON file that holds no walls, rooms or openings,
  such as a `tsconfig.json`. `--replace` does not change this, and nothing is written (WRT-13).
- `grid draw`, `check`, `describe`, `export` and `sheet` refuse a JSON file that holds nothing a
  plan holds, in one line, in place of drawing a blank page (WRT-13).

## For agents

- 2026-11-25, WRT-13: `grid_write_rooms` (rooms, layout or scan) answers an error, and writes
  nothing, when `plan` names `grid.json` or a file Grid keeps beside a plan, or an existing JSON
  file with no list of walls, rooms or openings and no `written` stamp; `replace=true` does not
  override it. Every tool that reads a plan answers the same for such a file: "… is not a Grid
  plan: it holds no walls, rooms or openings." A plan whose lists are empty is still a plan.
  No new code in the record.
