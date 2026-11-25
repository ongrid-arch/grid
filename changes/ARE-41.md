# 2026-11-25: taped lengths are set against the existing state (ARE-41)

## For people

- Lengths taped on site are now set against the building as it stands, not as the work will make it, so `grid check` and the answer of every change show the same table (ARE-41).

## For agents

- `taped` rows are measured on the existing state of a plan with phases. `grid_check` and every change's answer now agree; a length taped in a room that is new is `not-measured` with `missing: "no-room"`. No new code in the record.
