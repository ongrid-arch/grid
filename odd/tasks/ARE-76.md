# ARE-76: height, storeys and floor to floor per building, from its own ground

## Outcome

A row of identical split-level houses stepping up a street, each named as a building, reads as
what it is: every house is as high as the next, measured from the ground under it, and has the
storeys of one house, its half levels counted as split levels of those storeys, not as storeys
of their own. A floor's floor to floor runs to the next floor over its own footprint in its own
building, so a half level beside it is not the floor over it. The client sheet's cover gives the
same figures: the storeys of one building, the floor to floor between whole storeys over the
same footprint, and the height to the roof of each building from its own ground (a range when
they differ).

## Design

- `packages/floorplan/src/geometry/storeys.ts`
  - `planStoreys` counts storeys per building (the floors no building names together). Within a
    building a floor whose floor level stands inside the clear height of a lower whole storey of
    that building is a split level of it (a half level, or a mezzanine): it joins that storey's
    floors and is listed in its `split`, never a storey of its own. This is the rule the sheet's
    cover already used for its floor count (SHT-21), now in one place. Each storey records its
    `building`, its `floorLevel` and its floor to floor to the next whole storey over its
    footprint. The plan's `above` and `below` are the most of any one building: a terrace of six
    two-storey houses has two storeys, not twelve.
  - `buildingHeight` for a building with no pad: on one stated site ground, the site's ground
    lies under the lowest of the buildings' ground floors, and a building whose ground floor
    stands higher stands on ground as much higher (stating `pad` says otherwise); on a sloping
    site, the lowest ground under its own floors' walls. Both say `from: 'under'`. A single
    building, a building with a pad and a plan that names none read as before.
  - `buildingHeights` gives each building's `storeys` with its `split` count.
- `packages/floorplan/src/geometry/floorToFloor.ts`: `planLevels` gives each floor its floor to
  floor to the nearest floor above it in its building that shares its footprint (their slab
  outlines share more than `sameFootprintShare` of the smaller one); with none over it, to the
  top of its roof slab. A floor whose outline cannot be worked out shares every footprint, as
  before. `levelsSetTo` keeps stacking level on level, as LVL-24 set it, so setting a floor to
  floor never moves a half level onto the floor beside it.
- `geometry/tolerances.ts` and `docs/tolerances.md`: the new share, `sameFootprintShare` (0.25).
- `packages/cli/src/sheet/coverFigures.ts`: the cover's floors and floor to floor come from
  `planStoreys`, and the height to the roof from `buildingHeights`, each building from its own
  ground. Only the cover's figures change.
- `packages/cli`: `grid_areas` gives each building the ground its height is measured from and its
  split levels; `grid_set_building` and the levels lines name the ground the same way.
- Messages: the new ground (`from the ground under it`) and split levels, in `en.ts` and `es.ts`.

Decisions: the split-level rule reads floor levels, not footprints, so it also holds for a plan
whose levels are whole numbers but whose elevations step by half a storey. Without `buildings`, a
row of houses is still one building: naming them is what makes each its own.

## Done

- `geometry/__tests__/splitLevels.test.ts`: six identical split-level houses on a stated ground,
  each a building: every height equal, two storeys with two split levels each, the plan two
  storeys above ground; floor to floor 2.8 m storey to storey, never to the half level beside;
  a sloping site measures each house from the ground under it; a plain stacked building and a
  mezzanine read as before.
- `cli/src/sheet/__tests__/kindCover.test.ts`: the terrace's cover gives two floors, six
  buildings, 2.80 m floor to floor and one height to the roof.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders touched, the
  tolerances test, `ownWords` and the scoreboard.
