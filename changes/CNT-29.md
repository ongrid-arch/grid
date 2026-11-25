# 2026-11-25: a low seat before floor-to-ceiling glass is not a blocked window (CNT-29)

## For people

- A sofa or other low item in front of glazing that runs to the floor is no longer called a blocked window; a window counts as blocked only when the item leaves less than 1.2 m of its glass clear above it (CNT-29).

## For agents

- `item/blocks-window` and `use/window-blocked` judge a window against the glass left clear above the item, with a new limit `windowGlassKept` (1.2 m) beside `useApproachDepth`. No new code in the record.
