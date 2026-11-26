# CMD-37: two small slips in the edit help and in grid diff

## Outcome

- `grid edit opening --help` (and the `grid_change_opening` tool's schema) says `sill` is for a
  window's sill and for a door's threshold: `--sill 0` takes a door's step away.
- `grid diff` lists an opening that kept its place once, under "Openings that stayed where they
  were", whatever the plan holds, and counts it once. Likewise for the openings that moved with
  their wall or room.

## Design

- `packages/cli/src/mcp/writeTools.ts`: the `sill` argument's description in
  `grid_change_opening` (the one `grid edit opening` prints). Said in the person's terms: a
  window's sill, a door's threshold.
- `packages/floorplan/src/geometry/diff/building.ts`: the openings loop builds `stayed` and
  `movedWith`; they are returned with one entry per opening id (the first). The doubled line was
  seen once in a sample plan; the current code has no path of its own that pushes an opening
  twice that I could find, so the guard is where the lists are returned, not a change to the
  loop, and the test hands the comparison a plan that holds one opening twice (a plan read from
  a file never does: `plan/id-clash` leaves the second out).
- No new code, no new sentence.

## Done

- A test in `diff-building.test.ts`: a plan holding the same door twice gives one `stayed` line
  and one `movedWith` line.
- A test that the sill argument's description names doors.
- `ownWords.test.ts` and `tolerances.test.ts` still pass.
