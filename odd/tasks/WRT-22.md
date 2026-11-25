# WRT-22: written units are believed, and size limits follow the building

## Outcome

- In rooms text, a length written with its unit (`250m`, `240000mm`, `820ft`, and now `10km`) is
  taken as meant, at any size up to Grid's largest length. A 250 x 160 m warehouse written
  `250m x 160m` or `250000mm x 160000mm` compiles.
- A bare number past the plausibility limit is a question, not a refusal: the plan is written
  and the answer warns `rooms/size-question`, saying the length was read as metres and how to
  say it is meant (write the unit) or how to give another unit. The limit is in `tolerances.ts`
  (`roomsSideAsked`) and is weighed by the kind of building: lower in a home, higher in a
  building of large halls (the plan, or a floor of it, says `building assembly`, `sport`,
  `industry` or `warehouse`).
- A bare number so long it is no building (`roomsSideBare`, 2 km) is still refused, as most likely
  millimetres, naming the unit-written form that is taken (`2500m`).
- A side stretched with `*` and `until`, and a polygon's extent, obey the same limit: past it,
  the same question, so `*` no longer writes a 775 m corridor with nothing said while 250 bare
  was refused.
- The plan check's units question (`plan/units-question`) and its size questions read the same
  building kind: a warehouse or grandstand with 12 m walls is no longer asked whether it is in
  feet, and its large rooms and tall walls are asked about at a hall's figures.
- The edit tools take an opening or door as wide as its wall allows: `grid_split_room`'s
  `door_width`, `grid_add_room`'s `opening_width` and `door_width`, `grid_change_opening`'s
  and `grid_change_type`'s `width` no longer stop at 5, 20 or 50 m; the wall or room side decides,
  and the edits already refuse one that does not fit, with the wall's free stretches.

## Design

- `packages/floorplan/src/geometry/tolerances.ts`: `BuildingKind` gains `hall`, and an entry
  may carry a `hall` figure beside its `home` one. New limits: `roomsSideAsked` (200 m; 50 in a
  home; 1000 in a hall), `roomsSideBare` (2000 m) and `openingWidest` (1000 m, the edit tools'
  ceiling for an opening's width, below which the wall decides). Hall figures for
  `typicalHeightHighest` (30 m), `wallHighest` (80 m) and `roomLargest` (500000 m²).
  `docs/tolerances.md` gets the rows and the hall figures; the table test reads the new figure.
- `packages/floorplan/src/geometry/plausible.ts`: `buildingKind` reads the plan's and its
  floors' `building` first (a hall kind makes it a hall), then the home uses as before. It takes
  only the parts it reads, so the rooms compiler can ask it of the plan it wrote. The units
  question reads the kind; `inHome` names a hall too.
- `packages/floorplan/src/types/units.ts`: `readLength` reads `km` (and kilometres).
- `packages/floorplan/src/rooms/words.ts`: `UNIT_WORD` knows `km`; `hasUnit(word)` says whether a
  length word carries its unit.
- `packages/floorplan/src/rooms/compile.ts`: the fixed `> 200` refusal goes. A unit-written size
  is never asked about. A bare size past `roomsSideBare` is refused (`rooms/size`); every other
  bare, stretched or polygon side is kept with its line, and once the plan is written the sides
  past `roomsSideAsked` for its `buildingKind` are warned about as `rooms/size-question`. The
  words are in `messages/en.ts` (and draft `es.ts`), so the refusal sentence leaves compile.ts.
- `packages/cli/src/mcp/editTools.ts`, `writeTools.ts`: the opening and door width maxima read
  `limit('openingWidest')`. Outside the card's area; kept to those argument lines.
- `docs/rooms-first.md`: a paragraph on units and the size question.

Decisions taken alone:
- Hall kinds are `assembly`, `sport`, `industry` and `warehouse`: the large-span kinds Grid
  knows. `parking` is left out: its storeys are low, and its sides fit the `any` figures.
- A refusal stays for a bare length past 2 km, so a plan typed in millimetres (3600 for a
  3.6 m room) is still caught at once; with its unit written it is taken.
- The question is a warning on the write's answer (the rooms compiler's own code), not a new
  check message code: no catalogue entry is needed.
- Room-size maxima of the edit tools (100 m) are left as they are: the card names openings and
  door widths.

## Done

- `rooms/__tests__/units.test.ts` (new): 250m x 160m and 250000mm x 160000mm compile with no
  question; 10km reads; 250 x 160 bare compiles with a `rooms/size-question` naming metres; the
  same in a `building warehouse` plan asks nothing; 60 bare in a home is asked; 3600 bare is
  refused naming `3600m`; a `*` stretch until a room 775 m away is asked; a polygon 400 m long is
  asked.
- `geometry/__tests__/tolerances.test.ts`: the hall figure, and `buildingKind` reads a hall.
- `geometry/__tests__/plausible*`: a warehouse with 12 m walls gets no units question.
- `types/__tests__/units*`: `readLength('10km')` is 10000.
- `mcp/__tests__`: a 15 m split door and a 30 m opening change pass the argument check.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, `ownWords.test.ts`,
  `contract.test.ts`, `npm run scoreboard`.
