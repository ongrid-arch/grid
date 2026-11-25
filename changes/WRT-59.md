# 2026-11-25: one rule for edits on imperfect plans, and answers that lead with what the edit caused (WRT-59)

## For people

- An edit is no longer refused because one part or fact of the plan cannot be read. It goes on, the
  file keeps that part as written, and the answer says what was left out. Mirroring or turning the
  whole plan is still refused in that case, naming the parts.
- The answer to an edit opens with the new notes it caused, the plot boundary's first.
- A wall split along one side (for heights or kinds) moves with the side.
- Renaming a room renames it in the brief's wishes too, so they are not read as missed.
- Mirroring or turning a plan of massing (floor outlines, no walls) turns the outlines.
- Making a wall type the default needs its kind.

## For agents

- The tools that change the plan read a plan with parts the reader leaves out and write it back
  with them as written. The answer says `Left out of the reading, and kept in the file as
  written: …`; data `leftOut` lists them. `grid_mirror` refuses such a plan, naming them.
- The text opens with `This change caused …` when the plan's checks give notes after the edit that
  they did not before, boundary notes first; data `caused` lists each as `{ code, message }`.
- `grid_rename_room` also renames the brief's wishes that name the room and says so.
- `grid_move_room_side` moves a side made of several walls in one line as one.
- `grid_mirror` works on massing; with no walls and no outline it is refused.
- `grid_change_type` with `default` on a wall type with no kind is refused: give interior or exterior.
- No new code in the record.
