# 2026-11-27: escape openings follow the below-ground check (ARE-65)

## For people

- A window or door flagged as below ground is left out of the escape check,
  including when a light well in front of it is too shallow. If this leaves the
  room without an escape opening, the escape finding points to the below-ground
  notes. The check can still count an opening cleared by a deep enough light
  well or a ramp (ARE-65).

## For agents

- Escape candidates are excluded using the reported `opening/below-ground`
  findings. When the excluded openings leave a room without a candidate,
  the `room/no-escape-opening` result names the opening ids in `also` so they
  can be matched to the below-ground lines. No new code in the record.
