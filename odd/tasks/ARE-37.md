# ARE-37: an opening onto dug-away ground is not named as below the ground

## Outcome

`opening/below-ground` no longer names a door or window that opens onto a drawn space dug away in
front of it: an outdoor room (a light well, an area, a cutting, a courtyard) whose floor is at or
below the opening's foot, or the foot of a ramp. Where the outdoor room is drawn but its floor
stands above the opening's foot, the finding stays and its sentence names that room, so the person
knows to lower it. A plan that draws nothing in front of the opening is read as before.

## Design

- `packages/floorplan/src/geometry/rules/check.ts`: in the below-ground loop, for each opening
  `openingsBelowGround` names, work out the outdoor rooms among its `rooms`. If one has a floor
  (its floor's level plus `floorOffset`) at or below the opening's foot (within
  `openingBelowGround`), leave the opening out; if all are higher, keep it and name the first. An
  opening whose middle lies within one ramp width of the foot (lower end) of a ramp on its floor is
  left out too.
- Words: `check.belowGround.lightWell.wholly` / `.partly` in `en.ts` and `es.ts`, built by
  `saids.belowGround` with an optional drawn-space name.
- Decision: no new code and no new field; the `opening/below-ground` finding keeps its record.
- Decision: any outdoor kind counts, since the floor level decides, not the kind's name.
- Decision: the ramp's foot is its lower end; no new tolerance, the ramp's own width is the reach.
- `graph.ts` and `ground.ts` are untouched (`openingsBelowGround` still answers as before, so the
  escape check keeps its own treatment of outdoor rooms).

## Done

- Tests in `packages/floorplan/src/geometry/__tests__/ground.test.ts`: light well deep enough
  leaves the window out; light well floor above the sill keeps it and names the room; a ramp's foot
  leaves a door out; no space drawn still names it.
- `ownWords`, `tolerances`, `contract` tests, typecheck, lint, floorplan and rules folders, scoreboard.
