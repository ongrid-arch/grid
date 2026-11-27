# 2026-11-27: two rooms stacked between two others are written with sizes to centre lines or outside faces (WRT-80)

## For people

- A toilet over a store between a bedroom and a living room (or a WC and a cleaner's store between two offices) is written when the sizes run to the walls' centre lines (`sizes centre`) or outside faces (`sizes outside`), not refused with a gap "along 0.20 m" or "along 0.50 m". Written to the inside faces it already was, and the tests now hold that in every direction (WRT-80).

## For agents

- `grid_write_rooms` and `grid write` no longer answer `rooms/gap` for a stack of rooms between two others whose sizes measure to centre lines or outside faces and add up: the rooms are placed again with the walls the first placing found, as a text that writes already was, and the answer is that placing's. A stack truly shorter than the rooms beside it is still refused with `rooms/gap`. No new code in the check record.
