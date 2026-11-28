# CMD-55: finishes, types and glazing carried into the 3D files as materials

## Outcome

A person who sets finishes and types on a plan and exports it for a render, a game engine or a
BIM tool finds them in the file, not only in the app:

- A GLB and an OBJ carry one named material for each wall type, door type and window type the
  exported parts take and for each room finish they show (`walltype_<id>`, `doortype_<id>`,
  `windowtype_<id>`, `finish_<name>`), beside the kinds' own materials. Each is a plain PBR
  material (not metallic) whose colour is read from the words of its name, as the 3D view tints
  finishes ("Oak boards" is oak, "Grey porcelain tile" grey); the GLB's material `extras` say what
  it stands for (`gridType`, `gridTypeName`, `gridStated`, `gridFinish`).
- A room's floor is drawn in its floor finish. Each finished wall face is lined in the finish the
  room gives it (the room's walls, a feature wall's own, a band), a thin surface a hair into the
  room, open over its doors and windows, as the 3D view draws it. Every room has a ceiling, facing
  down at its height, in its ceiling finish or the `ceiling` material.
- A wall takes its type's material, a door's leaves its door type's, a window's frame its window
  type's. A glazed wall type, a glazed door type and every window's glass are written as glass:
  blended, seen through and double-sided. A glazed wall or door with no plan behind it (`toGlb`
  of a scene) is glass too.
- An IFC space carries its finishes: `Pset_SpaceCommon`'s `FloorCovering`, `WallCovering`,
  `CeilingCovering` and `SkirtingBoard`, and Grid's own `Grid_Finishes` with every feature wall and
  band. A ceiling covering is associated with its finish as its material. A glazed wall's body
  and a glazed door's leaves are styled as glass.

## Design

- `packages/floorplan/src/geometry/finishTint.ts` (moved from the viewer's `canvas3d/finishTint.ts`,
  which now re-exports it): the one reading of a finish's colour from its words, so the app and
  the files agree.
- `packages/floorplan/src/geometry/export/surfaces.ts` (new, pure): the plan's named materials
  (`planMaterials`: types in the plan's order, then finishes by name) and, for one floor, what its
  parts are drawn in (`storeySurfaces`: each wall's and opening's type material, each room's floor
  finish, and the interior parts from `sceneInterior`: linings and ceilings). Reusing
  `sceneInterior` means the files line exactly the faces the 3D view lines.
- `mesh.ts`: a `ceiling` kind material; `liningMesh` and `ceilingMesh` build the interior parts.
  A part's material is now a name: a kind's or one of the plan's.
- `gltf.ts` and `obj.ts`: each part takes its material from the floor's surfaces when there are
  any, then glazing, then its kind. The GLB lists the kinds it uses in `MESH_MATERIALS` order, then
  the plan's it uses in `planMaterials` order. Linings and ceilings are grouped with the rooms
  (`gridKind` `lining` and `ceiling`). `toMtl` writes the kinds and every one of the plan's
  materials, so every floor of one plan writes the same `grid.mtl`.
- `planExport.ts`: builds each floor's surfaces from its slice, its scene and its clear height,
  and hands the plan's materials to both writers and the MTL.
- `ifc.ts`: the space's finishes as above; the glass style on glazed walls and door leaves.
- Decisions: linings, not wall faces split by room, because a wall face may border several rooms
  and the interior already knows the exact stretches (bands, holes); a curved wall's faces get no
  lining, as in the app. A glazed wall stays glass, never lined. The MTL keeps its fixed name
  `grid.mtl`, so the CLI is unchanged; two plans exported into one folder share it (the last
  written wins). No new convention in `types/floorplan.ts`.

## Done

- `geometry/export/__tests__/materials.test.ts` (new): a plan with oak, tile and paint finishes, a
  wall type, a glazed wall type, a door type, a glazed door type and a window type exports a GLB
  whose materials hold each named one; the floor, lining and ceiling primitives use the finishes;
  the glazed wall's and door leaves' materials are blended; the OBJ's `usemtl` lines and
  `grid.mtl` agree; a plan with none keeps the kinds only (plus `ceiling`).
- IFC tests: the space's covering properties and `Grid_Finishes`, the ceiling's material, glass on
  a glazed wall and door.
- Existing GLB, OBJ, IFC and golden tests updated only where the ceiling and glass change them.
- build, typecheck, lint, vitest on every folder touched plus `packages/cli/src/mcp`, the
  floorplan purity and tolerance tests, scoreboard.
