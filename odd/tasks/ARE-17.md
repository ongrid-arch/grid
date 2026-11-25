# ARE-17: the brief's corridor width is the corridor's narrowest point

## Outcome
A brief's `corridor_width` figure is judged by the same number `grid_measure what=access` gives
for each corridor: its narrowest point from end to end. A corridor 0.90 m wide for 8 m with one
1.6 m end is missed against 1.2 m, and the line says the drawn figure is the narrowest and where
it is. Widening one stretch no longer turns the line to met while another stretch stays narrow.

## Design
- `packages/cli/src/quantities/access.ts`: export `corridorNarrowestOf(survey, room)`, the existing
  corridor measure (with the fixtures of the room's floor as obstacles) so the brief and the access
  measure share one function. The measure itself is unchanged.
- `packages/cli/src/brief/lines.ts`: for `corridor_width` read that measure instead of the widest
  circle. When Grid finds no two ends, fall back to the widest circle, as access does, and say so.
  The line reads "drawn 0.90 m, its narrowest point, at (x, y)".
- `docs/brief.md`: the figure table says "narrowest point from end to end".
- Decision: obstacles count (as in access), so both numbers agree; turning_circle keeps its rule.

## Done
- A test with an 8 m corridor, 0.9 m wide with a 1.6 m end: missed, drawn 0.90, "narrowest".
- A test that widening one stretch keeps it missed while another is narrow, and a plain
  corridor of 1.3 m is met.
- The existing lab test (hall 0.70) still passes.
- typecheck, lint, tests and scoreboard.
