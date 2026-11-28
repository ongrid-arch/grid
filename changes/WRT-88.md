# 2026-11-28: a bay window in one rooms text line (WRT-88)

## For people

- A bay window is one line of rooms text: `bay in living south, 2.4 wide, 0.9 deep, curved,
  windows 3` bows the living room's south side out into an arc with three windows along it, and
  `canted` makes a front and two cheeks at 45 degrees (or `canted 60`) with a window in each.
  `1.2 from west` places it along the side; without it the bay is centred (WRT-88).

## For agents

- `grid write` and `grid_write_rooms` read `bay in <room> <side>, [<m> from <end>,] <w> wide,
  <d> deep, curved | canted [<degrees>] [, windows <n> [<w> wide]]`. The width and depth measure
  to the room's inside faces. A curved bay is one curved wall (`arc`, C21) with id
  `<room>-bay-wall`; a canted bay is three straight walls, `<room>-bay-wall-1` to `-3` from the
  side's start (cheek, front, cheek). The walls are the floor's outside walls. Its windows are
  `<room>-bay-1`, `-2`, ... (a second bay on the same room `<room>-bay2-...`), on the plan's
  window sill and height: a canted bay takes `windows 3` (one per facet) or `windows 1` (the
  front); a curved bay any number, spread evenly along the curve. With no width each fills its
  facet or its share of the curve less 0.1 m (`bayWindowPier`) at each end, and every bay window
  is kept clear of the walls that meet its wall, so the check finds nothing to say about it.
- A canted bay's other straight sides that face the same way as its front make that side
  `<side>.1`, `<side>.2`, ...: a later `window ... in <room> south` line on the same side is
  answered with the sides to choose from, as for any side faced more than once.
- Refusals, under the existing codes: `rooms/unknown-room` (no such room above the line),
  `rooms/no-side` (no, or more than one, straight side faces that way; write `<side>.<n>`),
  `rooms/syntax` (a word the line does not read, no `curved` or `canted`, a window count a canted
  bay cannot take), `rooms/size` (no width or depth, a bay past the side's end or leaving a
  stretch shorter than the wall, a curved bay deeper than half its width, a canted bay with no
  front, windows that do not fit a facet or the curve) and `rooms/opening-fit` (a window the
  walls meeting its facet leave no room for). A `bay` line in a unit is refused as any line a
  unit cannot hold. The parking `bay <id> at ...` line is unchanged.
- Two new figures in the tolerance table: `bayCantAngle` (45 degrees) and `bayWindowPier`
  (0.1 m). No new code in the record.
