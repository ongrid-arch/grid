# 2026-11-25: the first call works in any folder (CMD-18)

## For people

- With no plan named, `grid` and the tool server now use `plan.json` in the folder they run in,
  whether or not the folder holds `grid.json`, for reading and for writing. When that file is not
  there, the refusal names the folder and the file it looked for and what to do (CMD-18).
- A new tool, `grid_project`, lists what the folder holds: its plans, the plan used by default, and
  the files kept beside each (CMD-18).
- `grid_write_brief` no longer writes over a brief that is already there unless `replace` is true.

## For agents

- 2026-11-25, CMD-18: `grid_project` (new, first of the 34 tools, no arguments) answers
  `{ folder, project, defaultPlan, defaultPlanThere, plans: [{ file, default, beside: [{ kind,
  file }] }], other, note }`. Every tool that takes `plan` now falls back to `plan.json` in the
  project folder when `grid.json` is not there; the old refusal "Pass plan: … holds no grid.json"
  is gone. When a read finds no such file it says "No plan was named, and <folder> holds no
  plan.json …". `grid_write_brief` takes `replace` (boolean) and is refused, changing nothing, when
  a brief is there and `replace` is not true. No new code in the record.
