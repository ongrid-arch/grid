# 2026-11-27: every floor in one DXF, at a scale that fits, with a block per schedule type (VEW-72)

## For people

- A DXF of a plan with several floors holds every floor unless you name one: side by side in model space, each on a paper layout named after the floor. `grid export --floor all` writes one file per floor, and `--floor` takes a floor's name as well as its id; a file of one floor is named after that floor (`house-first-floor.dxf`), not its place in the list (VEW-72).
- Each DXF sheet shows the plan at the largest standard scale it fits on A3 (1:100, 1:200, 1:500 or 1:1000), or at `--scale`, and says so, with the scale it would fit at, when a floor does not fit (VEW-72).
- Door and window blocks are one schedule type each, so windows of different heights no longer share a block, and each carries its MARK, TYPE, WIDTH, HEIGHT and SILL. The mark is the schedules' (`D1`, `W1`), and the IFC tags its doors and windows with the same marks (VEW-72).
- A door's hand is said one way in the schedule, the DXF and the IFC: the side its hinges are on, seen from the side it opens toward. DXF door blocks end in `-RH` or `-LH`, and the IFC door styles say "right hand" or "left hand" (VEW-72).

## For agents

- `grid_export` takes `out` (a file inside the project, as `grid export --out`) and `scale` (DXF: N in 1:N), and `floor` takes a floor's name or `all`. A dxf with no floor holds every floor: `floors` lists them all and `floorsLeftOut` is empty. The answer adds `files` (each file written and the floors it holds) and `sheets` (a DXF's scale per floor, whether stated, whether the floor fits, and `fitsAt`), and says the scale in a line unless it is 1:100, unstated, with every floor fitting. A file of one floor is named after the floor. DXF block names change: `GRID-DOOR-900x2100-W200-RH` (width by height, wall thickness, hand). The IFC door or window Tag is its schedule mark, its Name stays its id; the door styles' names say the hand in Grid's convention and their description names IFC's. No new code in the record.
