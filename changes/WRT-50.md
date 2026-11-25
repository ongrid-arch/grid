# 2026-11-25: a merge takes out every wall the two rooms share (WRT-50)

## For people

- Knocking two rooms into one no longer stops when they share more than one wall (after an earlier knock-through, or when one room wraps round a corner of the other). Every shared stretch is taken out in the one call, and with open-plan zones each gets its dividing line. When the two rooms state a counted fact differently (28 desks and 40), the answer names the value the merged room kept and the one it did not.

## For agents

- `grid_merge_rooms` (and `grid edit merge`): rooms that share several walls are merged in one call, each shared wall cut where the walls round it meet it, with the doors and windows in the stretches; the answer has a "Took out wall" line for each. With `zones: true`, each stretch is a dividing line (`<wall>-line`). A fact the two rooms state differently is in `notKept` as `"desks" ("28" kept, "40" not)`. A pair whose meeting would leave the merged room with a hole or two parts is refused by name; it was refused for any second wall before. To merge three rooms, call it twice. No new code in the record.
