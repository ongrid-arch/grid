# VEW-49: a doorless opening and a recess are drawn with their reveals in elevation

## Outcome

A doorless opening (type `opening`) in an elevation is a void in its wall, not a door-coloured
rectangle: the wall's edges step back to a second outline (its reveals), the corners are joined
by short lines, and what stands behind it is seen through it. A shop whose entrance is set back
(an opening in the front wall, the door in a wall further in) shows the door deeper, behind the
reveals, instead of a flush plain door. Doors and windows are drawn as before.

## Design

- `packages/floorplan/src/geometry/facade.ts`: a `FacadeOpening` carries `reveal`, the thickness
  of the wall it is cut in, in metres. A nearer face hides what is behind it except through its
  doorless openings (they are holes in its outline for `hiddenBy`), so a door on a deeper wall
  is kept when it is seen through one.
- `packages/viewer/src/picture/facade.ts`: the face's path gets each doorless opening that lies
  inside it as a hole (`evenodd`), so deeper faces show through. The opening is then drawn as its
  outer edge, an inner edge inset by the reveal (at most a quarter of the opening's smaller side,
  so a thick wall never swallows a small opening) and four lines between the corners.
  The viewer only draws what the core gives it.
- Decision: the inset is the real wall thickness capped by a quarter of the opening, because an
  elevation has no true depth; the capped figure is a drawing aid and is not measured anywhere.

## Done

- Core test: a doorless opening has `reveal` equal to its wall's thickness; a door on a deeper
  wall seen through a doorless opening in a nearer wall is kept, and is still hidden by a solid
  nearer wall.
- Viewer test: the void has `facade-reveal` parts (inner edge and four corner lines), the face
  path has the hole, the deeper door is drawn; a plain door has no reveal parts.
- Typecheck, lint, floorplan and viewer test folders, ownWords, tolerances, scoreboard.
