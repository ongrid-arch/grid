# VEW-64: the whole building in one GLB and one OBJ

## Outcome
An agent or person who exports a plan of several floors as GLB or OBJ, naming no floor, gets
the whole building in one file: every floor, each standing at its elevation, its slab, roof and
parapet included, as the 3D view stacks them. In the GLB the model is one root node with one
child node per floor, named by the floor's id and moved up to its elevation, so a 3D program
shows the floors as a tree and nobody writes a script to stack them. Naming a floor (`--floor`,
`floor`) still gives that floor alone, but it now stands at its elevation too: in the GLB the
root node carries it, in the OBJ the points do, so files of single floors land where they belong.
The answer of `grid export` and `grid_export` says which floors the file holds, at what height,
and which floors of the plan it does not hold, so a file of one floor of a 46-floor tower no
longer reads as complete. DXF and IFC hold what they held before.

## Design
- `packages/floorplan/src/geometry/export/gltf.ts`: `toBuildingGlb(storeys, options)`, each
  storey its id, elevation and `Scene3D`. Parts are named with one namer for the whole file, so
  names stay unique across floors. With `root: 'building'` the root node is `building` (the site
  offset, HND-11, in its translation when there is one) and each floor is a child node named by
  its id, translated `[0, elevation, 0]`, with `extras.gridFloor` and `extras.gridElevation`.
  With `root: 'floor'` (one floor asked for) the floor's node is the root and its translation is
  the site offset plus its elevation. `toGlb(scene)` is unchanged: the viewer's stills use it.
- `obj.ts`: `toBuildingObj(storeys, options)`. OBJ has no nodes, so every point is written at
  its height in the building (Z above the ground floor's floor level), each floor opened by a
  `# grid-floor "<id>" elevation=<m>` comment, with a header line that says so. No `g` lines:
  some readers turn a group into one object and would merge each floor's walls into one.
- `packages/floorplan/src/export/planExport.ts`: for OBJ and GLB, no `floorId` means every
  floor (lowest level first, as the 3D view orders them); a stale id still falls back to the
  ground floor, as the app relies on. Elevations come from `floorElevations`, the one rule the
  3D view and the IFC stack by. The GLB's site offset is worked out once on the whole plan and
  every floor is sliced from the moved plan, so each slice still finds its whole plan (its
  shell and stairs). `PlanExport` gains `floors` (the floors the file holds, with their
  elevation) and `floorsLeftOut` (the plan's floors it does not hold). A whole-building file has
  no floor in its name.
- CLI `command/export.ts` and `mcp/writeTools.ts`: a line saying which floors the file holds,
  only for a plan of several floors, on standard error and in the answer; `floors` and
  `floorsLeftOut` in `grid_export`'s data and output schema; the `floor` argument and `--floor`
  help say the whole building is written when it is left out. The words go in the message files
  (`drawing.export.floors.*`, `drawing.obj.*`).
- DXF stays one floor (the ground floor when none is named), as the card allows; its answer now
  names the floors it does not hold.
- Decision: the floors not held are their own field, not parts of `leftOut`, which counts parts
  that cannot be drawn and is mirrored in the file's note.

## Done
- `geometry/export/__tests__/building.test.ts`: a three-floor plan's GLB read by the independent
  reader has one root, three floor children named by id with their elevations, every floor's
  walls, slab and roof, the upper floors' points at their height; `--floor` gives one floor with
  its elevation on the root; OBJ holds every floor raised, with the floor comments; a site
  offset sits on the root.
- `export/__tests__/planExport.test.ts`: `floors` and `floorsLeftOut`, file names, stale id.
- `mcp/__tests__/exportTool.test.ts`: the answer's floors line and data for a several-floor plan.
- Updated: the HND-11 survey test (the root node), the e2e export tests that name a floor.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, `ownWords.test.ts`,
  `contract.test.ts`, `npm run scoreboard`; `changes/VEW-64.md`, `docs/commands.md` and
  `docs/tool-server.md`.
