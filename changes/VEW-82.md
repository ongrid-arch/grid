# 2026-11-27: a GLB a game engine or a renderer uses as it is (VEW-82)

## For people

- A GLB from Grid now opens in a game engine or a renderer ready to use (VEW-82). Every part's
  node carries what the plan says of it in its extras: its id, kind and floor, the rooms it stands
  in or between, and the use, finishes, type and your own facts when the plan has them. Each
  floor's parts are grouped by kind (walls, rooms, doors, windows ...). A door's leaf turns on its
  hinge. `--doors open` writes the doors open for a render, `--doors gaps` leaves the leaves out
  for a level to walk through, and `--doors markers` writes an empty marker in each door's place
  for the engine's own door. `--walls rooms` writes each straight wall as a piece for each room
  beside it, named by its rooms, instead of one mesh as long as the building. Your saved views
  are cameras in the file.

## For agents

- `grid_export` takes `doors` (`closed`, `open`, `gaps`, `markers`; glb only, left out `closed`)
  and `walls` (`whole`, `rooms`; glb only, left out `whole`); either for another format is refused
  with "doors applies to GLB only: leave it out for this format." (or walls). `grid export` takes
  `--doors` and `--walls` the same way.
- A glb's part nodes carry `extras`: `gridId`, `gridKind`, `gridFloor`, and when stated
  `gridRooms` (a wall's and an opening's as `{ left, right }`), `gridName`, `gridNumber`,
  `gridUse`, `gridFinish`, `gridType`, `gridProperties`; a door's and window's parts `gridPart`,
  a door's `gridSwing`, `gridDoorKind`, `gridMotion` and, on a swinging leaf, `gridOpens`. Each
  floor node's children are now kind groups (`walls_<floor>` ...) holding the parts, each with
  `gridFloor` and `gridKind`. A swinging leaf's node has a translation, its hinge, and its points
  are written from it. With `walls: rooms` a wall's pieces are named
  `wall_<wall>_<left rooms>.<right rooms>` with `gridPiece`. With `doors: markers` each door is an
  empty node `door_<id>` with `gridWidth` and `gridHeight`. Each saved view is a perspective camera
  in `cameras`, its node `view_<name>` a root of the scene with `gridView`, `gridTarget` and
  `gridRoom`.
- New tolerance table rows: `wallPieceShortest`, `doorOpenAngle`, `cameraNear`.
- No new code in the record.
