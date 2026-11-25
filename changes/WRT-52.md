# 2026-11-25: a dividing line takes no wall's width beside a unit, so opened bays keep their module (WRT-52)

## For people

- In rooms text, a room or unit placed beside a unit of several rooms now goes against the rooms it is opened to by a `virtual` line, even when the unit's other rooms have walls: an open lab beside a bay of a lab and a write-up room, or a corridor south of a row of such bays, keeps the size written for it, and the bays keep theirs. Bays sized to centre lines (`sizes centre`) keep their module across opened labs, repeats included: a bay written 3.3 m wide is 3.3 m between centre lines, every one of them (WRT-52).

## For agents

- `grid_write_rooms` and `grid write`: the gap between a room or unit and the room or unit it is placed beside is worked out for the rooms that will face each other across it, two by two: the wall between each two (none for a dividing line or `open`, else the wall a line states or their walls), less how far each stands back from its side's face, and the most any two need. A unit's rooms that face nothing across the gap no longer count. A `gap` on the place line still wins. Rooms sized to centre lines or outside faces placed beside rooms sized the same way line up by their sizes as written, not their inside faces, and give no `rooms/out-of-line` note for the half wall each takes off. Rooms sized to inside faces whose opened and walled rooms cannot both keep their sizes still give `rooms/area-differs`. No new code in the record.
