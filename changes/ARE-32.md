# 2026-11-25: a wall that meets at an opening's jamb frames it (ARE-32)

## For people

- A corridor carried through an opening as wide as the corridor, or a bay whose mouth is one opening, no longer gets "ends on another wall inside one of its openings" notes on the check, the drawing and the sheet. A wall is named only when it meets the other wall inside the opening, more than 1 mm from either jamb, so a row of identical blocks gets the same answer for every block (ARE-32).

## For agents

- `wall/ends-in-opening` is said only when the ending wall's centre line meets the other wall inside the opening by more than `openingOverrun` (0.001 m) from both jambs. A wall whose centre line meets at a jamb, or past it, makes that jamb and is not named, though half its thickness stands beside the hole. `opening/crosses-wall` and the edit commands' refusal of a new wall ending in an opening are unchanged. No new code in the record.
