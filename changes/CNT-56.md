# 2026-11-27: the site measured per building, with the density figures always given (CNT-56)

## For people

- Measuring the site of several buildings now measures each one on its own: a face's distance runs
  square to it and stops at the first other building in front of it, every line names the
  building, the buildings are measured apart, and a curved face is given once. Every site answer
  now gives the coverage, gross external area, floor area ratio, homes, homes per hectare and
  parking per home, for the whole site and each building (CNT-56).

## For agents

- `grid_measure what=site`: on a plan that names buildings, each face is a building's own
  (`faces[].building`) and its tape stops at the first other building (`stops` `edge` or
  `building`, `at`, `toEdge`); each edge names its nearest building (`boundary.edges[].building`);
  `buildings[]` gains `faces`, `coverage` and `rest` (the floors in no building, measured as one
  more); `apart` gives each pair's least distance. A curved face is one face with `curve`
  (`radius`, `pieces`, `closed`, `from`, `to`). Every answer adds `figures` (`plot`, `site`,
  `buildings[]`: `coverage`, `grossExternal`, `floorAreaRatio`, `homes`, `homesFrom`,
  `homesPerHectare`, `parking`, `parkingFrom`, `parkingPerHome`, `notMeasured`) and their lines.
  A set-back line names the building nearest its edge. No new code in the record.
