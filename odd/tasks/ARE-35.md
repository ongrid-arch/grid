# ARE-35: only the floor over an open stair below comes off a level's net area

## Outcome

A room used as a stair (or as a lift) that lies over the stair room below it loses from the net
area only the part of its floor that lies over that open stair. The rest of it, a landing or the
half flight of a split level that stands beside the stair below, is real floor and counts on the
level it serves. A stair room that lies wholly over the one below is counted once, on the floor the
stair rises from, as before. The rule of the net area says this in its sentence, and the answer's
note names the part taken off, so a split-level house whose half flights overlap by a strip is no
longer short of every upper level's whole stair room.

## Design

- `packages/floorplan/src/geometry/areas.ts`, `stairStacks`: besides the room each upper stair room
  is joined to (LVL-3's join, unchanged), it works out the floor of the upper room that lies over
  the stair rooms below it joins, by cutting the outlines (`cutOutline`, intersection then union).
- A room whose floor lies over the stair below to within `areaReported` is wholly over it: it keeps
  `countedWith`, the lowest room of its stair, and is in no net figure, as SHT-11 decided. The lowest
  room is found by following wholly-over rooms only, so a stair that steps aside on one floor is
  counted from that floor up.
- A room that lies only partly over it gets `overStair`: the floor taken off and the stair room
  below it lies over. Its `area` is its floor less that part (as a column's floor comes off), so it
  is in the net, its use and every total with what is left. It has no `countedWith`, so the CLI's
  one rule for rooms in no total (CNT-27) counts it, as it should.
- The floor's `overStairs` adds both kinds, so the gross figures still hold the floor and the
  identity gross = net + overStairs + … keeps to the last digit.
- The note for a partly-over room is a new sentence in the message files (`areas.overStair.one`,
  `areas.overStair.many`, in `en.ts` and `es.ts`), said with `say`. The net rule's sentence in
  `MEASURES` and `docs/areas.md` says the new rule.
- Kept out: what part of the lower stair room is the flight and what the landing. Grid takes the
  whole stair room below as open, as it already does; a stated stair's flights are not read here.
  No new convention, no new message code. Columns are CNT-33's and left alone.

## Done

- Tests in `packages/floorplan/src/geometry/__tests__/stairOverlap.test.ts`: a split level whose
  stair rooms overlap by 1.2 × 3.4 m loses only 4.08 m² per upper level; a stack that lines up still
  loses the whole room; the gross identity holds; the note and the rule say it.
- Existing area, quantity, sheet and brief tests still pass.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, `ownWords.test.ts`,
  `tolerances.test.ts`, the contract test and `npm run scoreboard`.
