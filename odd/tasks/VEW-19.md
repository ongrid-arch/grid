# VEW-19: the stated roof in every 3D still

## Outcome

A 3D still of a plan draws the roof the plan's own 3D model has. A one-storey plan with a gable,
hip, mono-pitch or flat roof stated on its floor is drawn closed, with that roof, and so is any plan
seen from a camera outside the building: the still then agrees with the GLB and the section, which
already draw it. `grid_view kind=3d` takes `roof: show` or `roof: hide` to choose for itself, for a
cutaway or to see into a one-storey plan from above, and its answer says which roof is drawn, never
"The model has no roof" over a picture of one.

## Design

- One decision, in the viewer (`packages/viewer/src/canvas3d/building.ts`): `stillRoofShown(plan,
  { focus, inside })`. With no floor cut away, the roof is drawn when the camera stands outside
  every room, when some floor states a roof, or when the building has several floors (as before).
  With a floor cut away it is not drawn: a cutaway shows the floor open. A camera standing in a
  room of a one-storey plan that states no roof keeps the open model it had, so the eye pictures
  and room views are lit as before.
- `buildingLayout` and `buildingFrame` take an optional `roof` (true or false) that overrides their
  own rule; left out, the app's 3D view is unchanged. With it, a single storey or a focused one gets
  a `roof` record too, so every storey drawn draws its roof over its parts with nothing above (the
  core's `sceneShell`, the same solids the GLB writes).
- `planStill` takes `roof?: boolean`; left out it is `stillRoofShown`. `stillScene` passes it on.
  So `grid draw`, the sheet's still and `grid_view` all follow the one rule.
- `grid_view kind=3d` gains `roof` (`show` or `hide`); its answer's sentence about the roof comes
  from the same decision and names the stated roof's shape when there is one. The tool's
  description says the new rule.
- Not changed: the section and facade code, the app's own 3D view, kind=eye (it cuts its floor
  away, so it stays open), the schema (no new convention).

## Done

- `building.test.ts`: the rule (outside, inside, stated, several floors, cut) and a single storey
  with `roof: true` getting a roof record.
- `planStill.test.ts`: a one-storey plan with a stated gable has roof meshes in its still scene, and
  `roof: false` takes them away; the GLB of the same plan has its roof node.
- The tool tests: `grid_view kind=3d` on a one-storey plan with a gable says the roof is drawn,
  `roof: hide` says it is not, `roof` on another kind is refused.
- `npm run typecheck`, `npm run lint`, the viewer and cli test folders, the own-words and contract
  tests, and the scoreboard.
