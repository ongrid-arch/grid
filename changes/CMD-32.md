# 2026-11-25: grid diff's floor is strict and narrows the answer (CMD-32)

## For people

- `grid diff --floor <id>` refuses a floor the plan does not have, with the floors it has,
  instead of drawing the ground floor. It no longer needs `--picture`: it narrows the rooms, the
  changes and the openings listed to that floor and says how many change lines it left out. The
  issues and the verdict stay whole (CMD-32).

## For agents

- `grid_diff` with `floor` narrows `rooms`, `changes`, `stayed` and `movedWith` to that floor, in
  the text and the data, as well as the picture. The data has two new fields: `floor` (the floor
  asked for, or null) and `otherFloors` (the change lines left out, 0 without a floor). The text's
  change heading reads `Changes on floor "<id>" (<n> of <m>; <k> on other floors or about none,
  left out):`. `issues`, `verdict` and `scope` stay whole. No new code in the record.
