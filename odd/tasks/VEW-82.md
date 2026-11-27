# VEW-82: a GLB a game engine or a renderer can use as it is

## Outcome

A person or an agent exports a plan as a GLB and opens it in a game engine (Godot, Unity, Unreal)
or a renderer (Blender) without a script of their own:

- Every node of a part carries what Grid knows of it in its `extras`, which glTF importers keep as
  the node's metadata: `gridId` (the part's id in the plan), `gridKind` (`wall`, `room`, `door`,
  `window`, `stair`, `column`, `item`, `slab`, `roof`, `parapet`), `gridFloor`, `gridRooms` (the
  rooms it stands in or between), and, when the plan states them, `gridUse`, `gridFinish`,
  `gridType` and `gridProperties` (the person's own facts, CNT-9). A door's or window's frame,
  leaves and glass say which they are (`gridPart`).
- Under each floor's node the parts are grouped by kind: one node per kind (`walls_ground`,
  `rooms_ground`, `doors_ground` ...), each with `gridFloor` and `gridKind`, so a level is hidden,
  collided or replaced a kind at a time.
- A door's swinging leaf is its own node, its origin on its hinge, so turning it about its Y axis
  opens it; `gridOpens` says which way (+1 or -1 about Y) opens it toward the face it swings to.
  `doors` (`--doors`, `grid_export doors`) chooses what a door is in the file: `closed` (as before,
  each leaf on its hinge), `open` (each swinging leaf turned open a quarter turn, for renders and
  walk-throughs), `gaps` (no leaves or door glass, the frames kept: a level to walk through) or
  `markers` (no door parts: an empty node per door at its threshold, turned along its wall, with its
  width, height and kind in its extras, for an engine to place its own door at).
- `walls` (`--walls`, `grid_export walls`) `rooms` splits each straight wall where the rooms beside
  it change, each piece a closed solid named by its wall and the rooms on its two sides
  (`wall_w1_kitchen.hall`), with `gridRooms` as `{ left, right }`. `whole`, the default, keeps a
  wall one mesh, as before.
- The plan's saved views (C11) are glTF cameras: one perspective camera per view, its node named by
  the view, placed and turned as the view is, with its vertical field of view and aspect ratio.

## Design

- `packages/floorplan/src/geometry/export/glbFacts.ts` (new): from one floor's plan, what each
  part's extras hold: the rooms on each side of each wall's stretch (`wallSides` from
  `exposure.ts`), the rooms an opening stands between, the room an item stands in, each room's use,
  finishes, type and number, each part's type and properties, each door's swing and kind.
- `packages/floorplan/src/geometry/export/wallPieces.ts` (new): a straight wall's elevation clipped
  to the stretches between rooms' corners, never through an opening; a stretch shorter than the new
  limit `wallPieceShortest` joins the one before it. Curved walls stay whole. Clipping the
  elevation's outline (a wall's cross-section is one upright run at any point outside its openings)
  and keeping the elevation's ends means the end pieces still meet the corners as the whole wall did.
- `packages/floorplan/src/geometry/export/glbNodes.ts` (new): the hinge of a door's leaf (the end
  of the leaf nearer its jamb, on its centre line), which way it opens, a door's marker and the
  saved views' cameras, each a pure function of the scene's parts.
- `gltf.ts`: `toBuildingGlb` takes each floor's facts and the options `doors`, `walls` and `views`;
  it writes the extras, the kind groups, the hinged leaves, the markers and the cameras. `toGlb` (a
  single scene with no plan, which tests and the stills use) writes the file as before. CNT-58's sun
  is kept, its node a root as before; cameras are roots too, at the plan's coordinates, as the views
  are stated (the site offset is the building node's, so a camera is at the view's place).
- `packages/floorplan/src/export/planExport.ts` builds each floor's facts and passes the options.
- The CLI: `--doors` and `--walls` in `command/export.ts`, `doors` and `walls` in `grid_export`
  (`mcp/writeTools.ts`); both refused for any format but GLB, by name.
- Decisions: defaults keep today's geometry (closed doors, whole walls), so a file someone already
  uses changes only by its extras, groups and hinge nodes; rooms are named by id in node names (ids
  are safe in a name, room names are not), and the names are in the extras; the open angle is a
  table limit (`doorOpenAngle`), as is the cameras' near plane (`cameraNear`).

## Done

- `packages/floorplan/src/geometry/export/__tests__/gameReady.test.ts`: the extras on walls, rooms,
  doors, windows and items of a plan with uses, finishes, types and properties; the kind groups
  under each floor; a leaf's node on its hinge, its points the same in the world as before; `open`
  turns it a quarter turn toward its swing; `gaps` and `markers` drop the leaves, `markers` adds one
  node per door; `walls: rooms` splits a wall beside two rooms into two named closed pieces whose
  triangles cover the same area as the whole wall, never through a door; saved views become cameras
  looking where the view looks.
- The CLI's export options refuse `--doors` and `--walls` for other formats and pass them to a GLB.
- The existing GLB tests pass unchanged; the tolerance test passes with the three new rows.
- `npm run build`, `npm run typecheck`, `npm run lint`, the touched folders' tests, `npm run scoreboard`.
