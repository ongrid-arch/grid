# 2026-11-27: aligned floor pictures and pixel coordinates (VEW-81)

## For people

- Floor pictures share one building frame by default. Grid writes a world file beside each PNG of a single plan, elevation or section, and the write answer reports the drawing origin (VEW-81).

## For agents

- Use `grid_view kind=plan frame=floor` to fit just one floor. Uncropped floor pictures otherwise share the building frame at the same settings. Orthographic picture answers and their `.view.json` give `pixelToMetres`, or a transform per panel in `panels` for `floor=all`. `worldFile` gives the `.pgw` path for a single orthographic PNG. `grid_write_rooms` reports the drawing origin, wall bounds corner and optional site reference in `origin`. No new code in the record.
