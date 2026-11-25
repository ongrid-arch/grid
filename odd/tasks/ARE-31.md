# ARE-31: one bad taped reading never takes the others with it

## Outcome

- A taped length that cannot be read (a negative, zero or non-numeric length, a side with no wall,
  one corner, a corner with one wall, a bad tolerance, an entry that is not an object) is left out
  with its own line at its place in the file (`taped[1].length`), and every other taped length is
  still set against the drawing in the table after `grid check`, `grid_check` and every change.
- A plan handed to `tapedLengths` without going through the reader, holding a length that is not
  a positive number, says that reading is not measured and why (`bad-length`) and never says it
  "differs" from a drawn length by a meaningless figure. The rows after it are still measured.

## Design

- The reader (`types/readParts.ts`, MSG-20) already leaves one bad entry of `taped` out alone, so
  the table is kept for the rest; this change pins that with a test for each kind of bad reading.
- `packages/floorplan/src/geometry/taped.ts`: `TapedMissing` gains `bad-length`; `measure` returns
  it first when the length is not finite and above zero, so no walls or outlines are touched for
  it. Its wording, `line.part.taped.missing.bad-length`, is in `messages/en.ts` and `es.ts`.
- `docs/result-contract.md`: the list of `missing` values names it.
- No new message code in the record: it is a state of a table row, not a finding.

## Done

- `packages/cli/src/taped/__tests__/taped.test.ts`: every kind of bad reading above leaves two
  rows that agree and a line naming `taped[1]`; several bad readings each have their line; a plan
  given straight to `tapedLengths` marks the bad ones `not-measured` and measures the rest.
- `npx vitest run packages/floorplan packages/cli`, ownWords and tolerances tests, typecheck,
  lint, scoreboard.
