# ARE-36: an entrance through an outdoor space is the entrance

## Outcome
A restaurant or house whose front door gives onto a terrace, porch or other outdoor space that
reaches the street has that way in read as its entrance. `grid describe --length walk` starts
there, and the access measures (`grid_measure what=access`) take it as the entrance, instead of
starting at a service door into the kitchen. A front the plan names (`front.opening`) is honoured
when that door is one of these ways in, as it is when the door opens straight onto the street.

## Design
- `packages/cli/src/quantities/measure.ts`: `entryWays(survey, next)` lists the doors a person
  comes in by: a door from a room straight to outside (as before), and a door from a room into an
  outdoor space (C26) that itself reaches outside, by a door or an open edge. Each is
  `{ room, via, through }`, `through` the outdoor space or null. Windows are never a way in.
- `describe/walk.ts` `wayIn` and `quantities/access.ts` `entranceOf` read it. The named front
  first; then, as before, a way in through an outdoor space comes before the rest (an outdoor space
  that reaches the street is the street side of the building), then a corridor, then the widest.
- `entranceOf` takes only the ways through an outdoor space when the floor has any; the access
  legs start from the room the door opens into.
- Decision: every outdoor kind counts, not only a terrace; a back yard reached by a service door
  counts the same, since the plan does not say which side is the front. A named front settles it.

## Done
- Tests: a plan whose service door into the kitchen is wider than a door onto a terrace starts the
  walk at the terrace door and has the access entrance there; the named front through a terrace is
  honoured; a plan with no outdoor space answers as before.
- `ownWords`, `tolerances`, typecheck, lint, the cli and floorplan test folders, the scoreboard.
