# 2026-11-26: a grouped note whose rooms changed is one issue in a diff (WRT-64)

## For people

- `grid diff` says a note that `grid check` gives once for several rooms, such as rooms with no
  door, as one issue when rooms join or leave it: "Note room/no-door changed (now also "Meeting";
  "Office 2" and "Office 3" no longer)". Before, merging two of those rooms printed the whole note
  twice, once as new and once as gone, and counted two issues (WRT-64).

## For agents

- `grid_diff` and `grid diff`: new issue code `note_changed`, between `note_added` and
  `note_gone`, for a grouped line of the drawing check (one with `each`) on both versions, of the
  same code and floor and with a part in common, that gained or lost parts. Its `message` is the
  later line's with the parts that joined and those that left by name; its `entities` are those
  parts. Such a pair was one `note_added` and one `note_gone` before. Two notes on one part each
  are still `note_added` and `note_gone`. `compareBuildings`' notes may carry `floor` and `each`,
  as `inspectPlan`'s lines do. It is the comparison's own code, not a line of the result record:
  no new code in the record.
