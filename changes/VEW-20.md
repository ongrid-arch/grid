# 2026-11-25: levels written one way, in the plan's units, in section and elevation (VEW-20)

## For people

- A section and an elevation now write a level the same way: the sign and figure first, then the
  floor's name (`+94.900 Level 29`). Both follow the plan's display units, so a millimetre plan
  reads `+94900` and a feet-and-inches plan reads `+310'-9"`; a section's room heights follow them too (VEW-20).

## For agents

- `grid_view` with `kind` `section` or `facade` now follows `units` and `decimal` (else the plan's
  display) for the levels in the picture and in the answer's text, which lists them as the picture
  does. The `data` stays in metres. The elevation's level labels were `Level 29 +94.90`; they are
  now `+94.900 Level 29`, as in a section. No new code in the record.
