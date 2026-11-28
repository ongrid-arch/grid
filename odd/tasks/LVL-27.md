# LVL-27: a void and an open slab leave no floor over the opening in 3D

## Outcome

A room marked as a void (`void: true`, LVL-4) is already left out of every area, needs no door,
and opens its storey's slab. Its floor, though, was still drawn: the 3D view and the GLB and OBJ
files laid a room floor over the opening, as they did in a stair room or a lift shaft on the floor
above, so an atrium or a stair well looked floored over. Now:

- A void has no floor in the 3D view, the GLB or the OBJ file. Its walls and its open edge stay.
- Every other room's floor is cut where its storey's slab is open: over a stated stair's flights
  and landings, over a stair room or a lift shaft on the floor below, over a ramp and over a void.
  The room floor and the slab under it now have the same hole, so nothing covers the opening.
- A room the opening covers wholly has no floor at all; one it splits is drawn in its pieces.
- A plan with no opening in any slab is drawn exactly as before.

## Design

- `geometry/scene3d.ts`: `SceneShell` gains `open`, the storey slab's openings joined (from
  `floorEnvelope`, which already works them out for the slab). `buildScene` works the shell out
  before the room floors and gives a room's `SceneSlab` its `pieces` when the opening reaches into
  it: the room less the opening, as `ScenePiece`s. A void's `pieces` are none. The room's
  `polygon` and `holes` stay its whole shape, so the linings, markers and finishes that read the
  room's outline are unchanged.
- `geometry/export/mesh.ts`: `floorMesh` lays the floor piece by piece when `pieces` is given;
  with no piece it is no mesh, so the GLB and the OBJ write no floor node for a void.
- `packages/viewer/src/canvas3d/Slab3D.tsx`: the slab under a room is extruded from the same
  pieces, so the 3D view agrees with the files (the one edit outside floorplan).
- Decisions: the cut is the slab's own openings, so it never disagrees with the slab; a scene of a
  plan of several floors that is no slice has no shell, and its floors are not cut (as its slab is
  not drawn either). The rooms-text compiler is not touched: a `void` word on a room line needs
  `rooms/compile.ts`, owned elsewhere for now; `grid_set` already sets `void` on a room.

## Done

- `geometry/__tests__/sceneVoid.test.ts`: a void's floor gives no mesh and its room no floor node
  in the GLB; a room on the floor above a stair room has its floor cut by the stair's area, and a
  plan with no opening keeps whole floors. They fail before the change.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders touched,
  `packages/cli/src/mcp`, `packages/cli/src/command`, and `npm run scoreboard`.

## Left for later

- `void` as a word on a room line in rooms text (needs `rooms/compile.ts`).
- A mezzanine or loft platform inside one storey, with its guarded open edge, headroom under and
  over it and its own area line: it needs a way to state a platform's level inside a storey that
  `types/floorplan.ts` does not have yet.
- An open or balustrade edge drawn as such in sections and elevations.
