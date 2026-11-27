# 2026-11-27: height, storeys and floor to floor per building, from its own ground (ARE-76)

## For people

- A row of houses stepping up a street, each named as a building, is measured house by house from
  the ground under it: six identical houses are each as high as the next, not higher the further
  up the street they stand. On a sloping site each building is measured from the lowest ground
  under its own walls (ARE-76).
- Storeys are counted per building, and a half level, or a mezzanine, standing inside the height
  of the storey under it is a split level of that storey: six two-storey split-level houses are two
  storeys each, with two split levels, never 24 storeys (ARE-76).
- A floor's floor to floor runs to the next floor over the same footprint, so a split-level house
  reads 2.8 m storey to storey, not 1.4 m to the half level beside it. The client sheet's cover
  gives the same figures: the floors of one building, the floor to floor between its storeys and
  each building's height to the roof from its own ground (ARE-76).

## For agents

- `grid_areas`: each building's `ground` and `from` are now the ground its height is measured from;
  `from` may be `under`, the ground under the building (the site's ground under the lowest of the
  buildings' ground floors, a building whose ground floor stands higher on ground as much higher;
  on a slope the lowest ground under its own walls). A building that stands otherwise states its
  `pad`. Each building's `storeys` adds `split`, its split levels, and its line reads "2 storeys
  with 2 split levels". The plan's `storeys` (also `grid_measure what=site`) counts per building
  and gives the most of any one; each storey record adds `building`, `split` (its floors on split
  levels, also listed in `floors`), `floorLevel` and `floorToFloor` (to the next storey over its
  footprint, or null). The storeys line now reads "counted by level in each building, the most of
  any one, a half level as a split level of the storey it stands in".
- `grid_set_levels`' and `grid_write_rooms`' levels: each floor's `floorToFloor` runs to the nearest
  floor over its footprint in its building (outlines sharing more than `sameFootprintShare`, 0.25
  of the smaller one), and `over` lists those floors; setting a floor-to-floor still stacks level
  on level. The building's height line may read "from the ground under it".
- New tolerance `sameFootprintShare` in the tolerances table. No new code in the record.
