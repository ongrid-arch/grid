# 2026-11-27: normals, UVs and a material per kind in the 3D files (VEW-73)

## For people

- A GLB from `grid export` now renders well in a game engine, a renderer or a headset as it is: flat normals, texture coordinates in metres, and a material named for each kind of part (wall, floor, door, frame, glass, slab, roof, stair, column, item). An OBJ names the same materials and comes with `grid.mtl` beside it. Room floors stand 5 mm above the slab, so the two no longer flicker. `--no-roofs` leaves the roofs out, and `--arc-segments 32` writes a round wall with 32 pieces for a lighter model. `docs/3d-files.md` gives the axes (OBJ Z up, GLB Y up), the units and how every node and object is named (VEW-73).

## For agents

- `grid_export` takes `roofs` (false leaves every roof and its parapet out) and `arcSegments` (the straight pieces a whole circle of curved wall is written with, 3 to 1000), for glb and obj only; either is refused for dxf and ifc. Its answer has `materials`: the `grid.mtl` an obj export wrote beside it, else null. A GLB's primitives carry `NORMAL` and `TEXCOORD_0` and name a material by kind; an OBJ has `mtllib grid.mtl` and a `usemtl` after each `o`. Room floors in both are 5 mm above the slab's top (`floorLift`). No new code in the record.
