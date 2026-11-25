# 2026-11-25: a scan of several rooms with no floor outlines (CMD-33)

## For people

- `grid write --scan` draws a scan that gives no floor outlines as every room its walls close
  round, with the walls between them, instead of one room with the others' walls dropped. Walls
  that close round no room are named in what was left out (CMD-33).

## For agents

- `grid_write_rooms` with a scan with no floor outlines answers a room for each closed ring of wall
  faces (`rooms`, each `from: "wall faces"`), and `leftOut` names the faces that close round no
  room by their scan ids. With several rooms on a storey, the room holding its longest face keeps
  the storey's scan key in `ids`; each other is keyed `<key>/<its longest face's id>`. The
  `scan/not-closed` refusal stays for a scan where no room closes. No new code in the record.
