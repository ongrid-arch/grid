# Normals, UVs and named materials in the 3D files

## Outcome

- A GLB that Grid writes renders well in a game engine, a renderer or a headset with no work
  first: every primitive has flat normals (`NORMAL`, unit length, one per face corner, so a
  wall's edge stays sharp) and texture coordinates (`TEXCOORD_0`) projected from the nearest of
  the three axes in metres, so a texture made for 1 m repeats once a metre on every wall, floor
  and roof, the right way up on walls and not mirrored seen from outside.
- Every part is drawn in a material named for its kind: `wall` (and parapets), `floor`, `door`
  (door leaves), `frame`, `glass`, `slab`, `roof`, `stair`, `column` and `item`. A person swaps a
  material once in Blender or Unity and every wall changes. Only the materials a file uses are
  written, always in that order.
- The OBJ names the same materials: `mtllib grid.mtl` in its header and `usemtl <kind>` before
  each object, and the export writes `grid.mtl` beside it, with the same colours as the GLB.
- A room's floor is lifted a few millimetres off the slab it stands on (`floorLift`), so the two
  no longer share a plane and flicker in a viewer.
- `grid export --format glb|obj` takes `--no-roofs`, which leaves the roofs and their parapets
  out (to walk through or look into the model), and `--arc-segments <n>`, the straight pieces a
  whole circle of curved wall is written with, so a round wall can be light enough for a game.
  `grid_export` takes the same as `roofs: false` and `arcSegments`. Either is refused by name
  for DXF and IFC.
- `docs/3d-files.md` says, for both formats, the axes (OBJ Z up as the plan, GLB Y up, plan y is
  glTF -z), the units (metres), how nodes and objects are named (`wall_<id>`, a floor's node by
  its id, the `building` and `origin` nodes), the materials, the normals and UVs, the floor lift,
  and the two options.

## Design

- `packages/floorplan/src/geometry/export/mesh.ts`: `MESH_MATERIALS`, the one table of kinds and
  their colours, and `materialOf(prefix)`, the kind a part's name prefix is drawn in. `floorMesh`
  raises the floor's top by `tolerance('floorLift')`; a raised room keeps its sides from the
  storey's floor up to its lifted top.
- `gltf.ts`: each part's mesh is written unshared per face normal: a point is written once per
  normal it carries (`flatVertices`), so faces of one plane still share their points and an
  edge between two planes is sharp. The normal is the face's, turned into glTF's frame with the
  points (the same rotation), and the UV is the box projection worked out in the model's frame
  (Z up) from the face's normal. A degenerate face gets the up normal so nothing is written as
  NaN. Each primitive names its kind's material by index into the materials the file uses.
- `obj.ts`: `mtllib` and `usemtl`, and `toMtl()`, the text of `grid.mtl` from the same table.
  OBJ keeps no normals or UVs of its own: the brief asks for them in the GLB, and an OBJ reader
  works out flat normals itself.
- `arc.ts`: `curvePieceCount`, `curveStationsBetween` and `curveDeviation` take an optional
  pieces-per-circle; `scene3d.ts`: `SceneOptions.arcSegments` passes it to `curvedWallPieces`.
  Left out, nothing changes, so the 3D view, the checks and every other file are as before. The
  room floors along a curved wall keep the finer outline: they reach into the wall, never short
  of it, so no gap shows.
- `export/planExport.ts`: `PlanExportOptions.roofs` and `arcSegments`, applied to OBJ and GLB
  only (roofs by dropping the shell's roof and parapet from each floor's scene); the
  approximation note measures the curve at the pieces used. `PlanExport.materials` carries the
  `.mtl` text for an OBJ.
- `packages/cli/src/command/export.ts` and `src/mcp/writeTools.ts`: the options, their checks and
  writing `grid.mtl` beside the OBJ (in `exports/`, or beside `--out`). The name is fixed
  because the table is: every OBJ Grid writes can share one.
- Decisions: the default number of pieces for a curve does not change (it is what the 3D view
  and the area figures use); a parapet goes with its roof; window sashes are frame and glass,
  so `door` is the leaves of doors only; stairs, columns and items have materials of their own
  beyond the seven named in the request, so they can be told apart.

## Done

- `export/__tests__/glbSurface.test.ts`: every primitive has `NORMAL` and `TEXCOORD_0` of the
  same count as `POSITION`, unit normals that agree with each face's winding, UVs equal to the
  box projection of the positions in metres, materials named by kind (a wall's primitive names
  `wall`, a door leaf `door`), the floor above the slab's top, and the same bytes twice.
- OBJ tests: `mtllib grid.mtl`, a `usemtl` before every object, and `toMtl()` naming every
  material the OBJ uses.
- Options: a full-circle wall with `arcSegments: 32` has 32 pieces (and far fewer triangles than
  by default); `roofs: false` leaves no `roof_` or `parapet_` part; the command and the tool
  refuse either for DXF and IFC and accept them for GLB and OBJ, and write `grid.mtl`.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed.
