# 3D files: GLB and OBJ

Read this before you open a GLB or OBJ from Grid in a game engine, a renderer, a headset or a
3D program, or write code that reads one: which way is up, the units, what each node and object
is called, the materials, the normals and UVs, and how to make the file lighter.

`grid export --format glb|obj` and `grid_export` write them ([commands](commands.md)). Both hold
what the 3D view draws, from the same triangles.

## Axes and units

Both files are in metres, 1 unit to 1 m. Neither is scaled.

| | OBJ | GLB |
|---|---|---|
| Up | +Z | +Y (glTF is always Y up) |
| The plan's x | +X | +X |
| The plan's y | +Y | -Z |
| A point (x, y) at height h | `v x y h` | `(x, h, -y)` |

The GLB's frame is the OBJ's turned, not mirrored: faces keep facing out and nothing needs
re-winding. An importer that wants Y up from the OBJ turns it, as for any Z-up file (Blender's
OBJ importer does it with its Up axis set to Z).

Heights are above the ground floor's floor level. A building of several floors has each floor at
its elevation ([every floor in one 3D file](commands.md#every-floor-in-one-3d-file-vew-64)). A
plan at survey coordinates is moved near zero in the GLB and moved back by one node (`origin`, or
the root), because a 32-bit point holds only about seven digits; `asset.extras.gridOrigin` says by
how much. The OBJ writes its numbers as they are.

## Nodes and objects

Every part is one node (GLB) or one `o` object (OBJ), named `<kind>_<id>` from the plan's id, with
anything but letters, digits, `_`, `.` and `-` turned into `_`, and `_2`, `_3` added when two ids
would give one name.

| Name | What it is |
|---|---|
| `wall_<wall id>` | A wall, a closed solid, its doors and windows cut out; a curved wall is its straight pieces |
| `floor_<room id>` | A room's floor, a surface facing up |
| `lining_<room id>` | A room's finished wall faces in one finish, a surface a hair into the room (CMD-55); `_2`, `_3` for its other finishes |
| `ceiling_<room id>` | A room's ceiling, a surface facing down a hair under its height, every lowered zone with it (CMD-55) |
| `stair_<stair id>` | A stair's treads and landings |
| `column_<column id>` | A column, once, whole |
| `item_<item id>` | A fixture or a piece of furniture, as plain blocks |
| `frame_<opening id>`, `leaf_<opening id>`, `glass_<opening id>` | A door's or window's frame, its leaves and its glass |
| `slab_<floor id>`, `roof_<floor id>`, `parapet_<floor id>` | The slab a floor stands on, its roof and the parapet round it |
| `ground_site` | The ground, cut to the plot, over every pool and over the floors that go down into it (GLB of the whole building, with a plot stated) |
| `neighbour_<id>` | A neighbouring building or other shape of context, from the ground or its floor to its height |
| `fence_<id>`, `gate_<id>`, `path_<id>`, `paving_<id>` | The site's fences and gates at their height, its paths and paving on the ground |
| `trunk_<id>`, `crown_<id>` | A tree's trunk and its crown |
| `water_<id>` | A pool's water, sunk into the ground below its edge |

In a GLB of the whole building the root node is `building`, with a child node per floor named by
the floor's id (`extras.gridFloor`, `extras.gridElevation`), and each floor's parts under it,
grouped by kind (VEW-82): `walls_<floor>`, `rooms_<floor>`, `linings_<floor>`, `ceilings_<floor>`, `stairs_<floor>`, `columns_<floor>`,
`items_<floor>`, `doors_<floor>`, `windows_<floor>` and `shell_<floor>` (slab, roof, parapet), each
with `extras.gridFloor` and `extras.gridKind`, and only the kinds the floor has. A GLB of one floor
has that floor's node as its root. CNT-60: a GLB of the whole building holds
the site too, in one node `site` under `building`, at the datum: the ground at the site's level
(`site.ground`, on a slope as the site states it) when the plot is stated, and the neighbours,
fences, gates, paths, paving, trees and pools, each on the ground at its middle. Where the site
states no height, depth or canopy, the figures drawn are Grid's own (`fenceDrawnHeight`,
`treeDrawnHeight`, `treeDrawnCanopy`, `poolDrawnDepth` and the others in
[tolerances.md](tolerances.md)). A GLB of one floor holds no site. The OBJ has no nodes: each floor's objects
follow a comment line `# grid-floor "<id>" elevation=<metres>`.

What the file leaves out, and the curves it writes as straight pieces, are in the GLB's
`asset.extras` (`gridLeftOut`, `gridApproximated`) and in the OBJ's header comments.

## For a game engine or a renderer

A GLB carries what Grid knows of each part in its node's `extras` (VEW-82), which Godot, Unity
(glTFast), Unreal and Blender keep as the node's metadata or custom properties:

| Key | What it is |
|---|---|
| `gridId` | The part's id in the plan; a door's or window's frame, leaves and glass carry the opening's, a slab, roof or parapet its floor's |
| `gridKind` | `wall`, `room` (a room's floor), `lining`, `ceiling`, `door`, `window`, `stair`, `column`, `item`, `slab`, `roof` or `parapet` |
| `gridFloor` | The floor it stands on |
| `gridRooms` | The rooms it stands in (a room, an item, a column) or between: a wall's and an opening's as `{ "left": [...], "right": [...] }`, by the wall's faces, `left` the face 90 degrees counter-clockwise from its start to its end |
| `gridPart` | A door's or window's `frame`, `leaf` or `glass` |
| `gridName`, `gridNumber`, `gridUse` | A room's name, the number the plan states and its use; an item's or a column's label |
| `gridFinish` | A room's finishes as the plan states them; a wall's, the finish of its face in each room beside it, by room id |
| `gridType` | The wall, door, window or room type it takes; an item's kind; a column's shape |
| `gridProperties` | The person's own facts on it (`grid_set_facts`) |
| `gridSwing`, `gridDoorKind`, `gridMotion`, `gridOpens` | A door's side it swings to and its kind as the plan states them, how its leaves move (`swings`, `slides`, `folds`, `rolls`), and for a swinging leaf which way it opens |
| `gridOutdoor`, `gridRoofed` | An outdoor space's kind and whether a roof covers it |

A key is there only when the plan states it.

### Doors

A swinging leaf (a single or a pair) is a node of its own whose origin is its hinge, on the leaf's
centre line at its foot: turning the node about its Y axis swings the leaf, and turning it by a
positive angle times `gridOpens` (+1 or -1) opens it toward the face the door swings to (the
wall's left face for a door that does not say). `--doors` (`doors` for `grid_export`) chooses what
a door is in the file:

| `--doors` | A door is |
|---|---|
| `closed` (left out) | Its frame and its leaves, shut, each swinging leaf on its hinge |
| `open` | The same, each swinging leaf turned open 90 degrees (`doorOpenAngle` in [the tolerances](tolerances.md)), for renders and walk-throughs |
| `gaps` | Its frame alone: no leaves and no door glass, a level to walk through |
| `markers` | No geometry: an empty node `door_<opening id>` at the middle of its threshold, turned so its +X runs along the wall, with `gridWidth`, `gridHeight` and the door's other extras, for the engine to place a door of its own |

### Walls split at their rooms

`--walls rooms` (`walls: rooms`) writes each straight wall as a piece for each stretch between the
rooms beside it, so a game engine gets the walls of each room, not one mesh as long as the
building. A piece is named `wall_<wall id>_<left rooms>.<right rooms>` (`outside` for none, `+`
between two rooms on one face, written `_`) and carries `gridRooms` as `{ left, right }` and
`gridPiece` (`from` and `to` along the wall). Each piece is a closed solid; where another wall
meets the wall, the cut runs down that wall's centre line. A cut never runs through a door or a
window, and a stretch shorter than `wallPieceShortest` joins its neighbour. A curved wall stays
whole. `--walls whole`, the default, keeps every wall one mesh.

### Saved views as cameras

Each of the plan's saved views (`grid_save_view`) is a perspective camera, `view_<name>`, a root of
the scene: it stands where the view stands, looks where it looks (a glTF camera looks down its
-Z, its +Y up), with the view's vertical field of view and aspect ratio and a near plane of
`cameraNear`. Its extras name the view (`gridView`), the point it is pointed at (`gridTarget`, plan
metres, z up) and its room (`gridRoom`).

## Materials

Every part is drawn in a material named for its kind, so a material swapped once in your program
reaches every part of that kind:

| Material | Parts |
|---|---|
| `wall` | Walls and parapets |
| `floor` | Room floors |
| `door` | Door leaves |
| `frame` | Door and window frames, and window sashes |
| `glass` | Glass, seen through (blended, double-sided) |
| `slab` | Slabs |
| `roof` | Roofs |
| `stair` | Stairs |
| `column` | Columns |
| `item` | Fixtures and furniture |
| `ceiling` | Room ceilings that name no finish |
| `cut` | Party walls (CNT-60: a separating wall, or one with a neighbour beyond it), drawn as cut |
| `ground` | The ground |
| `site` | Fences, gates, paths and paving |
| `planting` | Trees |
| `water` | Pools' water, seen through |
| `context` | Neighbouring buildings and other shapes of context |

The colours are plain and only tell the kinds apart; no material is metallic.

### The plan's own materials (CMD-55)

Past the kinds, the file has one material for each of the plan's wall, door and window types and
each finish its rooms name, so a renderer swaps the oak floor once and every oak floor changes:

| Material | Parts |
|---|---|
| `walltype_<type id>` | The walls of that type; glass (blended, double-sided) for a glazed type |
| `doortype_<type id>` | The leaves of the doors of that type; glass for a glazed type |
| `windowtype_<type id>` | The frames and sashes of the windows of that type (their glass stays `glass`) |
| `finish_<finish>` | Room floors in that floor finish, the linings of wall faces in that finish, ceilings in that ceiling finish |

The name is written as a node's is: anything but letters, digits, `_`, `.` and `-` turned into
`_` (`finish_Oak_boards`). Its colour is read from the words of its name, as the 3D view tints a
finish: a colour word first ("Grey porcelain tile"), then a material word ("Oak boards"); a name
with neither takes its kind's colour. In a GLB its `extras` say what it stands for:
`gridMaterial` (`wallType`, `doorType`, `windowType` or `finish`), and `gridType`, `gridTypeName`
and the material the type states (`gridStated`), or `gridFinish`. A part with no type or finish
of its own keeps its kind's material; a glazed wall or door is `glass` when the file is made
from a scene with no plan behind it.

Every room has a ceiling (`ceiling_<room id>`), in its ceiling finish or `ceiling`, and every wall
face a room finishes (the room's walls, a wall's own face, a band) is lined in that finish
(`lining_<room id>`), open over its doors and windows, as the 3D view draws them: a lining stands
`liningOffset` into the room (a band twice as far) and a ceiling as far under its height
([the tolerances](tolerances.md)). Both face into the room, so seen from outside they are culled
in a viewer that hides back faces. A curved wall's faces and a glass wall are not lined.

A GLB lists only the materials it uses, the kinds in the order above, then the plan's own in
theirs: types in the plan's order, walls, doors, windows, then finishes by name. An OBJ names them
with `usemtl <material>` after each `o` line and reads them from `grid.mtl` (`mtllib grid.mtl` in
its header), which the export writes beside it, in `exports/` or beside the `--out` file:
every kind, then every one of the plan's own, so each floor of one plan writes the same
`grid.mtl`. Two plans exported into one folder share that file, and the last one written wins.

## Normals and UVs

Every GLB primitive has `POSITION`, `NORMAL` and `TEXCOORD_0`:

- Normals are flat: each face's corners carry the face's normal, so a wall's edge stays sharp and
  a flat face shades flat. A point is written once for each plane it lies on.
- UVs are box-projected in metres from the axis each face is nearest to, so a texture made for 1 m
  repeats once a metre on every wall, floor and roof, and two walls at a corner meet at the same
  scale. On a wall the texture stands upright and is not mirrored seen from outside; on a floor
  or roof north is up the texture.

The OBJ writes no normals or UVs: an OBJ reader works out flat normals itself.

## Room floors and the slab

A room's floor stands 5 mm above the slab under it (`floorLift` in
[the tolerances](tolerances.md)), so the two never share a plane and flicker in a viewer. A room
set above or below its floor (a stage, a sunken room) is raised from its own level the same way.

## Lighter files

- `--no-roofs` (`roofs: false` for `grid_export`) leaves out every roof and the parapets on it, to
  look into the model or walk through it.
- `--arc-segments <n>` (`arcSegments`) writes a whole circle of curved wall with n straight
  pieces, from 3 to 1000, and an arc with its share of them. Left out, a curve is written as
  finely as Grid measures it, 210 pieces to a circle or more; 32 is light enough for a game
  and still reads as round. The file says how far the pieces stand off the curve. Room floors
  along the wall keep the finer outline, which runs into the wall, so no gap shows.

Neither applies to DXF or IFC, and both are refused for them. `--doors` and `--walls` apply to a
GLB only.
