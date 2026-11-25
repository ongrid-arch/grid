# 2026-11-25: a wall that meets at an opening's jamb frames it (ARE-32)

## For people

- A corridor carried through an opening as wide as the corridor, or a bay whose mouth is one opening, no longer gets "ends on another wall inside one of its openings" notes on the check, the drawing and the sheet. A wall whose centre line meets the other wall at a jamb, within 1 mm, makes that jamb, so a row of identical blocks gets the same answer for every block (ARE-32).

## For agents

- `wall/ends-in-opening` is not said of a wall whose centre line meets the other wall within `openingOverrun` (0.001 m) of the opening's jamb: it makes that jamb, though half its thickness stands beside the hole. A wall that meets anywhere else with its body in the opening is named as before. `opening/crosses-wall` and the edit commands' refusal of a new wall ending in an opening are unchanged. No new code in the record.
