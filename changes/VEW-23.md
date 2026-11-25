# 2026-11-25: a glazed wall type is cut as glass in a section (VEW-23)

## For people

- A section now draws a wall whose type is glazed, such as a curtain wall, as glass in a frame
  with a mullion at each cut edge, instead of as solid wall. Solid walls beside it stay solid (VEW-23).

## For agents

- `planSection` marks a wall part of a glazed type `glazed: true` and lists those parts in the new
  `glass`; `cut` holds only the solid parts. The section picture draws `glass` as
  `section-glass` groups (frame, glass line, mullions). No new code in the record.
