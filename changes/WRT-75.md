# 2026-11-26: a fit-out on a base plan, written in rooms text and started by a tool (WRT-75)

## For people

- A fit-out can be written and started now, not only read: rooms text takes a first line
  `base shell.json`, and its rooms rest on the walls of that base plan their faces lie on, so the
  shell is never drawn twice. `grid write` writes the fit-out with only its own walls, rooms,
  doors and windows; `grid describe --as rooms` reads it back with its `base` line; and
  `grid edit fit-out --base shell.json` starts one with the base's rooms as its own (WRT-75).

## For agents

- Rooms text: `base <plan>` names the base plan, from the project folder. A wall Grid works out
  whose room faces lie flush on a base wall's faces is not written; the room's boundary names
  the base wall by its id. A wall worked out that ends on one ends on the base wall's centre
  line. Refused (`rooms/base`): a door or window in a base wall, a part of the text with a base
  wall's or opening's id, a base that is not read (outside the project, missing, naming a base
  of its own, or the plan being written). Said: `rooms/base-off` (a room face near a base wall but
  not on it, with the distance), `rooms/base-partly` and `rooms/base-renamed` (a worked-out wall
  with a base id written `<id>-fit`). The write answer has a line naming the base and the base
  walls the rooms rest on; `RoomsResult.base` holds them.
- `grid write` / `grid_write_rooms`: write `base` into the plan; over a fit-out, a text on the
  same base is an ordinary rewrite, and one naming another base or none is refused with
  `rooms/phases` unless `replace`. The plan's own phases still refuse rooms text, as before.
- `grid_describe as=rooms` on a fit-out writes the `base` line and only the fit-out's own parts.
- New tool `grid_start_fit_out` (`base`, `plan`, `name`, `replace`), after `grid_phase_from`: 49
  tools. Answers `written`, `base`, `rooms`, `changed` and `toLookAt`.
- The rooms grammar has a `fit-out` topic. No new code in the result record.
