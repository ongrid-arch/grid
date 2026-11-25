# VEW-45: a door with no swing is said and drawn one way

## Outcome

A door that states no swing means one thing everywhere: "no swing stated, so Grid draws no leaf
and does not check its sweep". The write answer says that, the drawing (the working look an agent
gets as well as the technical one) shows the door as a dashed line with "?", and the check says
the door's swing is not decided. Nobody is told it is a plain gap while another place draws a
mark.

## Design

- The plan records no difference between a door written `no-swing` and a door that never said,
  so both are the same case, "no swing stated". Telling them apart would need a new field and a
  new convention, which this change does not take.
- `rooms.rawRoom.noSwing` (en, es) and the matching sentence in `rooms/compile.ts` stop saying
  "plain gap" and say what is drawn: a dashed line and "?" until a swing is stated.
- `WORKING_LOOK.undecidedDoors` becomes `true`, so the pictures an agent gets draw the same mark
  the technical look does. Decision: the screen's Canvas2D (a separate drawing) keeps its plain
  gap and is not changed; it draws no door marks at all.
- Tests: the write answer's wording, the working look drawing the mark, the look table.

## Done

- `rooms` tests for the write answer, `looks.test.ts` for the working look, `ownWords` and
  `tolerances` tests, typecheck, lint, scoreboard.
