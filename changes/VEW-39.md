# 2026-11-25: sliding doors drawn as panels, frame squares inside the wall (VEW-39)

## For people

- A sliding door is drawn on the plan as two panels with their glass and an arrow for the way one
  slides, not as two loose lines. In a detailed drawing, a door's or window's frame squares now lie
  inside the wall's faces, the pen's width included (VEW-39).

## For agents

- No new code in the record. The plan symbol of a sliding door (`openingSymbol`) now has
  `leaf` lines for each panel's four edges, a `glass` line down each panel and an arrow (three `arrow` lines) toward the middle for each;
  the DXF block of a sliding door carries them.
