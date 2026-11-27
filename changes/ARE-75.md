# 2026-11-27: the building measured and drawn before the work (ARE-75)

## For people

- Measure, schedule, describe, find and export the building as it stands before the work, as it
  will be after it, or both; get an area table of existing, proposed and change by room and use;
  and draw the demolition plan and the proposed plan by name (ARE-75).

## For agents

- `grid_areas`, `grid_schedule`, `grid_describe`, `grid_find`, `grid_view` and `grid_export` take
  `state`: `before` or `after` reads the plan as it stands then, as a plan of that state alone,
  says so in the answer and adds `state` to the data. Left out, each answers as before.
- `grid_areas state=both` answers the area table of the work: `work.rooms` (each room's floor,
  id, name, use, phase, `existing`, `proposed`, `change`), `work.byUse`, `work.floors` and
  `work.net`, `work.grossInternal`, `work.grossExternal`, in text and CSV (`row,floor,id,name,use,
  phase,existing m2,proposed m2,change m2,change sq ft`); the rest of the data is the figures after
  the work.
- `grid_find state=both` finds among every part, demolished ones too; its `view` carries `state`.
- `grid_describe state=both` describes the building before and then after the work.
- `grid_view state=demolition` draws the demolition plan and `state=proposed` the proposed plan.
- `grid_export state=before` (or `after`) writes `<plan>-before.<ext>` (or `-after`) beside the
  export of the whole plan.
- No new code in the record.
