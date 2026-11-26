# 2026-11-26: open edges and railings on outdoor rooms (WRT-76)

## For people

- Terraces, balconies and other outdoor rooms now have open edges by default. Rooms text can add railings and parapets, or open a side of a room or unit. Plan drawings distinguish outdoor fills, open edges, railings and low walls (WRT-76).

## For agents

- Outdoor rooms can stand apart without filler rooms. Use `edge open`, `edge railing <h>` or `edge wall [<h>]` on a room line and `open <side>` on a room or unit placement. A single outside wall line accepts `virtual` or `railing`. The plan keeps railings as `railing: true` on walls, and rooms text reads those walls back. Unused wall thickness and outdoor headroom are explained in the rooms write answer. No new code in the check record.
