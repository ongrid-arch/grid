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
| `stair_<stair id>` | A stair's treads and landings |
| `column_<column id>` | A column, once, whole |
| `item_<item id>` | A fixture or a piece of furniture, as plain blocks |
| `frame_<opening id>`, `leaf_<opening id>`, `glass_<opening id>` | A door's or window's frame, its leaves and its glass |
| `slab_<floor id>`, `roof_<floor id>`, `parapet_<floor id>` | The slab a floor stands on, its roof and the parapet round it |

In a GLB of the whole building the root node is `building`, with a child node per floor named by
the floor's id (`extras.gridFloor`, `extras.gridElevation`), and each floor's parts under it. A
GLB of one floor has that floor's node as its root. The OBJ has no nodes: each floor's objects
follow a comment line `# grid-floor "<id>" elevation=<metres>`.

What the file leaves out, and the curves it writes as straight pieces, are in the GLB's
`asset.extras` (`gridLeftOut`, `gridApproximated`) and in the OBJ's header comments.

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

The colours are plain and only tell the kinds apart; no material is metallic. A GLB lists only
the materials it uses, always in this order. An OBJ names them with `usemtl <material>` after each
`o` line and reads them from `grid.mtl` (`mtllib grid.mtl` in its header), which the export writes
beside it, in `exports/` or beside the `--out` file. Every OBJ Grid writes names the same
`grid.mtl`, so one copy serves them all.

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

Neither applies to DXF or IFC, and both are refused for them.
