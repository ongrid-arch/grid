# 2026-11-27: party walls and neighbours written, and the site shown in 3D (CNT-60)

## For people

- A wall shared with next door can be marked a party wall by the room's side ("the hall's west
  wall is a party wall"), and the buildings round the plan added with their heights. The 3D
  views, every 3D picture and a GLB of the whole building now show the site: the ground at the
  site's level cut to the plot, the neighbours, fences, gates, paths, paving, trees, and a pool
  sunk into the ground with its water; a party wall is drawn as a cut, and a shape standing on an
  upper floor stands up there (CNT-60).

## For agents

- New tool `grid_set_party_wall`: `room` and `side` (as rooms text names a side) or `walls` by id;
  `beyond` `neighbour` (default) or `common`; `clear` makes them ordinary walls again. Writes
  `kind: "separating"` and `beyond` on the walls; the data adds `walls`.
- New tool `grid_change_neighbour`: `action` add, move, resize or remove one shape of the plan's
  `context`, by `points` or a box (`at`, `width`, `depth`), with `height`, `floor` and `name`; `by`
  or `to` to move it. The data adds `neighbour`.
- `grid_view kind=3d` and `kind=eye` draw the site's things and the context shapes; the 3D ground
  is cut to `site.boundary` when stated and over every pool.
- `grid_export format=glb` of the whole building holds a node `site` under `building`
  (`ground_site`, `neighbour_<id>`, `fence_<id>`, `gate_<id>`, `path_<id>`, `paving_<id>`,
  `trunk_<id>`, `crown_<id>`, `water_<id>`) and new materials `cut`, `ground`, `site`, `planting`,
  `water` and `context`; a party wall is written in `cut`. `grid.mtl` lists the new materials.
- New tolerance entries: `siteLift`, `fenceDrawnHeight`, `fenceDrawnThickness`,
  `treeDrawnHeight`, `treeDrawnCanopy`, `treeDrawnTrunk`, `poolDrawnDepth`, `poolWaterBelowEdge`.
- No new code in the record.
