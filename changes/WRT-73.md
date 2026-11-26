# 2026-11-26: phases set without hand-editing the file (WRT-73)

## For people

- A renovation no longer starts with editing the file: Grid marks the plan as it stands as
  existing, so every change after it is the work; marks walls, doors, windows and rooms as
  existing, demolished or new, by id or by room; and writes one plan with phases from two plans,
  the building as it stands and as it will be. `grid edit start-works`, `phase` and
  `phase-from` do the same from the command line.
- To fix a survey without making building work ("the hall is on the right, actually", "you
  missed a window"), pass `--correction` to the edit. `grid edit mirror --how left-right --keep-north` mirrors a plan
  drawn the wrong way round and leaves its north where it was (WRT-73).

## For agents

- Three new tools, after `grid_add_opening`: `grid_set_phase` (`phase`, and `parts` by id or
  `rooms`), `grid_start_works` (every part that states no phase becomes `existing`; one that
  states a phase keeps it) and `grid_phase_from` (`before`, `after` and `out`: one plan with
  phases from two plans, paired by id; a part that changed is `new` with its id and its old self is
  `<id>-before`, `demolished`). The first two answer as every change does; `grid_phase_from`
  answers `written`, `changed`, `counts` by phase and `kept`.
- `correction: true` on `grid_change_opening`, `grid_change_wall`, `grid_move_room_side`,
  `grid_mirror`, `grid_merge_rooms`, `grid_split_room`, `grid_add_room`, `grid_stretch`,
  `grid_square_scan` and `grid_add_opening` makes the change in place on a plan with phases,
  changing no part's phase, instead of making it the work. A mirror or turn takes what is to be
  demolished too; any other correction leaves it as it was and says so under `couldNotKeep`. `grid_mirror` takes `keep_north: true` with `how` to
  mirror the building and keep the north the plan states. The tool server now lists 41 tools.
  No new code in the record.
