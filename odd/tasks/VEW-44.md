# VEW-44: a label that is not drawn takes its leader with it

## Outcome
A plan picture never has a leader line that leads to nothing. A room's label moved out of its
room onto a leader stays inside the part of the plan the picture shows (a crop, a zoom, a piece
of a long floor, a sheet's frame); when no spot inside the view is clear, the label waits and
no leader is drawn. Small rooms still get their number in the room (VEW-13) and the key beside
the drawing names them.

## Design
- `picture/scene.ts`: `SceneInput.view` (the picture's viewport). The area a moved label may
  use (`within`) is the drawing's margin as before, cut to the view. `planSvg.ts` passes it.
- A leader is only drawn from a placed label, so a label left unplaced has none.
- Decision: the app's live 2D canvas does not pass a view, so it places labels as before.

## Done
- `picture/__tests__/leaderInView.test.ts`: fails before (a leader to a label outside the
  view), passes after; an uncropped picture keeps its leaders.
- viewer tests, typecheck, lint, scoreboard.
