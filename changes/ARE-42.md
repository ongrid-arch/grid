# 2026-11-25: a building total with the floors that could not be measured named (ARE-42)

## For people

- When one floor's gross area cannot be worked out, Grid now gives the total of the other floors
  and names every floor it left out, with why, instead of only saying the total is not known
  (ARE-42).

## For agents

- `grid_areas` adds `partial` when `grossInternal` or `grossExternal` is null for the building
  but known on some floors: `partial.<measure> = { area, floors, unmeasured: [{ floor, why }] }`.
  The whole-building fields stay null, so a partial sum is never read as the building's total.
  The text line and `notes` say it too. Every failing floor is listed. No new code in the record.
