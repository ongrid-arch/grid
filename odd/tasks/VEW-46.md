# VEW-46: a structural grid's spacing is dimensioned to the millimetre

## Outcome

A grid's dimensions are drawn in metres to the millimetre: a 7.425 m spacing reads 7.425, not
7.43, and the spacings add up to the overall figure by eye.

## Design

- `packages/viewer/src/canvas2d/labelPlacement.ts` (`dimensionText`): takes the dimension's kind;
  a `grid` dimension in plain metres prints to the millimetre (three decimals), every other kind
  as before. `dimensionTextBox` and the drawing (`picture/scene.ts`, `picture/markLayout.ts`)
  pass the kind, so the label's box is sized for the longer text.
- Decision: three decimals always (6.000, not 6) so all figures in a string line up and add up.
  A drawing with its own display (feet and inches, millimetres, a set precision) is unchanged.
- The values themselves (`gridDimensions`) are already exact sums of the spacings.

## Done

- `packages/viewer/src/canvas2d/__tests__/gridDimensionText.test.ts` fails before and passes after:
  7.425 reads 7.425 and four spacings add up to the overall.
- Type check, lint, floorplan and viewer test folders, ownWords, tolerances and the scoreboard.
