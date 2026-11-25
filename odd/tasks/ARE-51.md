# ARE-51: ramp lines in the take-off write each unit once and name floors by name

## Outcome

`grid_takeoff` on a plan with ramps says "3.00 m up over 35.75 m", not "3.00 m m up over 35.75 m m",
and names the ground floor "Ground floor", not its id `g`, whether or not the floor has parking bays.
The levels follow the person's units too.

## Design

- `takeoff.ramp` and `takeoff.ramp.stated` (en and es) no longer carry " m" after a figure: the
  figures come from `lengthText`, which already writes its unit.
- `parkingLines` in `packages/cli/src/mcp/readTools.ts` takes the floor names from the plan's floors,
  not from the bay counts, which only know floors that have bays. The levels use `lengthText` too, so
  a person who asked for feet gets feet.

## Done

- A test on a plan whose ramp joins a basement with bays to a ground floor with none reads the line
  and finds no doubled unit and no floor id.
- `ownWords`, `tolerances`, typecheck, lint and the floorplan and cli folders pass.
