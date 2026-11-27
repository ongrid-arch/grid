# CNT-60: party walls and neighbours written, and the site shown in 3D

## Outcome

A plan already holds party walls (a wall of kind `separating`, with what lies `beyond` it) and
neighbouring buildings (`context`, outlines with a height), but no tool wrote them, and the 3D
views and the GLB drew none of the site: a terrace stood as a box on an endless ground, a sunken
pool read as a raised block and a platform up a floor sat on the ground. When this is done:

- An agent marks a party wall the way the person says it, by a room's side: `grid_set_party_wall
  room=hall side=west` makes the wall on the hall's west side a party wall with a neighbour
  beyond it (`beyond=common` for a landing or a stair of the building that is not drawn), and
  `clear` makes it an ordinary wall again. Walls may be named by id too.
- An agent adds, moves, resizes and takes out a neighbouring building or any other shape of
  context with `grid_change_neighbour`: its outline (or a box by its corner, width and depth),
  its height, the floor it stands on and its name.
- `grid_view kind=3d` and `kind=eye`, the app's 3D view and a GLB export of the whole building
  draw the site: the ground at the site's level (`site.ground`, on a slope as `site` says), cut
  to the plot when a boundary is stated, cut away over a pool and over every floor that goes
  down into it; the neighbours as masses from the ground, or from the floor they stand on, to
  their height; the fences and gates at their height; paths and paving on the ground; trees as a
  trunk and a crown; a pool sunk into the ground with its water below the edge.
- A party wall is drawn as a cut: in the 3D views and the GLB it takes a cut wall's own colour
  and material, so the person sees that the building goes on past it.

## Design

- `packages/floorplan/src/geometry/siteScene.ts` (new): `siteScene(plan, elevations)` gives the
  site's solids as plain blocks (an outline, a bottom and a top, in the floors' own datum), each
  with its kind and id: `neighbour`, `fence`, `gate`, `path`, `paving`, `water`, `trunk`,
  `crown`. Each thing stands on the ground at its middle (`groundLevel`'s surface on a slope). A
  context shape that names a floor above the ground floor stands on that floor's level, so a
  platform up a floor is drawn up there; one with no height is drawn as a footprint on the ground.
  Pure, never throws: a thing that cannot be drawn is left out.
- `groundPlane.ts`: `sceneGround` is cut to the plot's boundary when the site states one, in
  place of the square round the building, and cut away over every pool, so the water is seen
  down in the hole. No boundary: the square as before.
- `scene3d.ts`: a `SceneWall` of kind `separating`, or stating a neighbour or a common part
  beyond it, carries `cut: true`. Nothing else in the scene changes.
- Defaults the drawing needs where the site states none go into the tolerance table
  (`geometry/tolerances.ts`, `docs/tolerances.md`): a fence's and a gate's height and thickness,
  a tree's height, canopy and trunk, a pool's depth and its water below the edge, how far paving
  and paths are lifted off the ground so the two never flicker. CNT-58's `treeCrownBase` and
  `canopySides` are reused for the crown.
- Viewer: `canvas3d/Site3D.tsx` draws `siteScene`'s blocks, each kind in its own colour (water
  see-through), mounted in `BuildingScene` beside the ground, so the app's view and every still
  draw it from one place. A cut wall takes a fixed cut colour in `Storey3D`. The viewer works out
  no geometry.
- GLB: `toBuildingGlb` takes the site (`site` option) and writes it as one node `site`, a child of
  the building's root, its ground and its blocks as parts in new materials (`ground`, `site`,
  `planting`, `water`, `context`); a cut wall is written in the `cut` material. Only a file of the
  whole building carries the site. The edit to `gltf.ts` is kept to the option and the node, as
  another change edits its extras at the same time.
- CLI: `packages/cli/src/edit/context.ts` holds the two changes (`setPartyWall`,
  `changeNeighbour`), patches of the plan's own fields as every change is; the patch's wall change
  gains `beyond`. `packages/cli/src/mcp/contextTools.ts` holds the two tools, registered after
  the site's tools.
- Rooms text (`wall hall west party neighbour`, a `neighbour` line) is the rooms-text compiler's,
  which another change owns now: left undone here, the tools take it as arguments.
- No new convention in `types/floorplan.ts`: C23 already holds party walls and context shapes, and
  C13 the site's things. A pool's own depth would need a field; until then the default is used.

## Done

- `geometry/__tests__/siteScene.test.ts`: a fence of stated height stands that high from the
  ground; a pool's water lies below the ground and the ground has a hole over it; a plot cuts the
  ground to its boundary; a neighbour on a floor 4 m up stands at 4 m; a tree is a trunk and a
  crown; a sloping site lifts a thing to the ground at its middle.
- `scene3d` test: a separating wall is `cut`, an ordinary one is not.
- GLB test: a building file of a plan with a site holds a `site` node with ground, water and
  neighbour parts in their materials; a plan with no site writes no `site` node.
- Viewer test: `siteBlocks` drawn as geometries, each kind its colour.
- CLI tests: `grid_set_party_wall` by room and side, by wall id, and `clear`; refused for a side
  the room does not have; `grid_change_neighbour` add, move, resize and remove, refused with the
  ids it has. Tool order test with the two new tools.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  tolerance test, `ownWords.test.ts`, and `npm run scoreboard` not worse.
