# CMD-33: a scan of several rooms with no floor outlines

## Outcome

A phone room scan that gives no floor outlines is drawn as every room its wall faces close
round, not as one. A scan of two rooms side by side becomes two rooms with a wall between them,
each within 0.001% of the area its own faces enclose. Faces that close round no room are named
in what the scan left out, by their scan ids. A scan whose faces close round no room at all is
refused as before (`scan/not-closed`).

## Design

- `packages/floorplan/src/scan/toPlan.ts`: `chainFaces` joins faces end to end from one face and
  answers the room they close round, or none. A storey with no floor outline is read by
  starting from its longest face not yet in a room; a start that closes nothing is tried from
  the next longest, until no face left starts a room. What is left is named as faces that close
  round no room. The refusal stays for a storey where no room closes, worded from the longest
  face's chain as before.
- Room scan ids: a storey with one room keeps the key it had (the scan's id, or `<id>#<storey>`),
  so earlier scans kept beside a plan still match. With several rooms, the room holding the
  storey's longest face keeps that key and each other is keyed `<key>/<its longest face's id>`,
  which a re-scan finds again while that face is in it.
- `packages/floorplan/src/test-support/roomScan.ts` already builds several rooms with
  `floors: false`; the tests use the invented flat and two rooms.

## Done

- `scan/__tests__/scan.test.ts`: two rooms with no floor outlines are two rooms with one wall
  between them and no problem in the drawing; the invented flat with no floor outlines is its
  four rooms; a room with a face missing beside a closed one draws the closed one and names the
  three faces left; a re-scan keeps every room's id.
- Type check of `packages/floorplan`, lint, the floorplan tests, `ownWords.test.ts` and
  `tolerances.test.ts`.
