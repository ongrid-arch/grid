# CMD-46 — Accurate edit answers

## Outcome

A split gives the measured areas of both pieces and reports window loss only when the
original room actually loses its last window. A rooms-text rewrite compares the complete
plans on both sides, including columns that stay in the file. Edit verdicts count rooms
by floor and identify an opening swing change in place.

## Design

Use the same area measurement as `grid_areas` and read the assembled rooms-text output
for the comparison. Expand patterned windows for the split's answer while keeping the
pattern in the plan file. Keep the existing comparison of edits by room ID and floor,
and use the comparison's opening details to describe a single door swing change.

## Done

Exercise a column-bearing rewrite, a courtyard split, and a split with patterned windows
through the tools. Retain checks for a single rename, 46 repeated floors, net area beside
columns, and a door swing in a symmetric plan. Run the build, type check, lint, affected
package suites, and scoreboard.
