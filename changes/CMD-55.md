# 2026-11-28: finishes, types and glazing in the 3D files as materials (CMD-55)

## For people

- A GLB or OBJ from Grid now carries your finishes and types (CMD-55). Each wall, door and window
  type and each room finish is a named material (`walltype_brick`, `doortype_oak`,
  `finish_Oak_boards`), coloured from its name as the 3D view tints it. A room's floor is drawn in
  its floor finish, each finished wall face is lined in its finish, and every room has a ceiling,
  in its ceiling finish when it names one. Glazed wall types, glazed doors and windows' glass are
  glass, seen through. An OBJ's `grid.mtl` holds every one of them.
- An IFC now holds the finishes: each space's floor, wall, ceiling and skirting finishes in
  `Pset_SpaceCommon`, and every finish, feature wall and band in `Grid_Finishes`. A ceiling is made
  of its finish, and glazed walls and glazed doors' leaves are styled as glass.

## For agents

- `grid_export format=glb|obj`: materials past the kinds, `walltype_<id>`, `doortype_<id>`,
  `windowtype_<id>` and `finish_<name>` (named as nodes are), and a new kind `ceiling`; a GLB's own
  materials carry `extras.gridMaterial` (`wallType`, `doorType`, `windowType`, `finish`) with
  `gridType`, `gridTypeName`, `gridStated` or `gridFinish`. New parts `lining_<room>` (a room's
  finished wall faces in one finish) and `ceiling_<room>` (every room), in a GLB under the new
  groups `linings_<floor>` and `ceilings_<floor>` with `gridKind` `lining` and `ceiling`, `gridRooms`
  and `gridFinish`. A room floor's material is its floor finish's, a typed wall's its type's, a
  glazed wall's and a glazed door's leaves' glass. `grid.mtl` lists every kind, then every one of
  the plan's own.
- IFC: `Pset_SpaceCommon` gains `FloorCovering`, `WallCovering`, `CeilingCovering`, `SkirtingBoard`;
  a new set `Grid_Finishes` per space that names a finish; ceiling coverings associated with their
  finish as an `IfcMaterial`; glass style on glazed walls and glazed door leaves.
- No new code in the record.
