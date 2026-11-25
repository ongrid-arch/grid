# 2026-11-25: assumed parts in a section are dashed, not hatched (VEW-27)

## For people

- A section marks the slabs, roofs and walls Grid took because the plan states no thickness or
  height with a light tint and a dashed outline, not a 45-degree hatch, which reads as concrete or
  insulation (and on a plan means brick). The key under the drawing says "Dashed outline" (VEW-27).

## For agents

- `grid_view` `kind=section` and `grid draw --section`: the picture's assumed parts are
  `data-part="section-assumed"` (was `section-hatch`), with the same `data-kind` and `data-ids`, and
  no hatch pattern. The text answer lists them as `dashed:` (was `hatched:`); the `hatched` flag in
  `section.assumed` keeps its name and means marked on the cut. No new code in the record.
