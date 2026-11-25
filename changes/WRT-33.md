# 2026-11-25: a merge says when the merged room's type no longer fits, and offers the doubled door (WRT-33)

## For people

- Knocking two rooms into one now says when the merged room keeps a type of the person's own (a
  fact such as `unit type: 1.5x3`) that the new size may no longer fit, and takes `type` to give it
  its own. When the merged room has two doors on one wall, the answer names them and says how to
  take one out; nothing is removed unasked (WRT-33).

## For agents

- `grid_merge_rooms` takes `type`: the merged room's type, written to the type fact its rooms carry
  (a fact whose name ends in "type"), or to a fact named `type` when they carry none. Left out, the
  answer's "Guessed" lines say the merged room keeps the first room's type and its new area. Two
  or more doors on one wall of the merged room are named in the answer, with the
  `grid_change_opening` call (`remove: true`) that takes one out. No new code in the record.
