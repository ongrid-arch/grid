# 2026-11-26: the whole building in one GLB and one OBJ (VEW-64)

## For people

- `grid export --format glb` and `--format obj` with no `--floor` now write the whole building:
  every floor, with its slab, roof and parapet, each at its elevation, as the 3D view stacks them.
  The GLB holds one root node, `building`, with a child node per floor named by the floor's id and
  raised to its elevation, so a 3D program shows the floors as a tree. The OBJ writes every point
  at its height in the building and opens each floor with a comment naming it. Naming a floor
  still gives that floor alone, now at its elevation too, so files of single floors land where
  they belong. For a plan of several floors the command says which floors the file holds and
  which it does not. A DXF still holds one floor, the ground floor when none is named (VEW-64).

## For agents

- `grid_export` with `format` `glb` or `obj` and no `floor` writes every floor of the plan into
  one file (before: the ground floor only, at height 0). The answer has two new fields: `floors`,
  the floors the file holds, lowest first, each `{ id, elevation }` with the elevation in metres
  above the ground floor's floor level, and `floorsLeftOut`, the ids of the plan's floors the file
  does not hold. For a plan of several floors the text has one line saying the same
  (`Holds all 3 floors of the plan, …` or `Holds floor "first" only, … the other 2 floors are not
  in this file: …`). In the GLB the scene's one root node is `building`, each floor a child node
  named by its id with `translation` `[0, elevation, 0]` and `extras.gridFloor` and
  `extras.gridElevation`; with a `floor`, that floor's node is the root and carries its elevation.
  A plan's site offset (HND-11) is on the root node, which `asset.extras.gridOrigin.note` names.
  The GLB's old `origin` node is gone. The OBJ marks each floor with
  `# grid-floor "<id>" elevation=<metres>`. A whole-building GLB or OBJ is named after the plan
  alone (`house.glb`). `leftOut` still counts parts that cannot be drawn, never floors. No new
  code in the record.
