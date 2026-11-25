# 2026-11-25: what rooms text writes passes the drawing's own check (WRT-17)

## For people

- `grid write` no longer writes a plan that `grid check` then finds fault with in the walls it worked out itself. The wall between two rooms of different widths reaches the wider room's corner; the walls of two lifts in the corners of one lobby stay apart across the floor between them; a wall beside a 45 degree wall leaves no gap; and the walls of honeycomb cells are no longer called inside walls stated exterior. A window over a door, or two openings sharing a stretch of wall, is refused with both lines named, instead of written and then left out by the check. Floor the rooms close round that no room claims (a floor wrapped round a core with no core written), a wall made as thick as an odd gap between two rooms, and any other note the check would make are said in the answer (WRT-17).

## For agents

- `grid_write_rooms` and `grid write`: the answer's problems and warnings have new codes. `rooms/openings-overlap` is now a problem (it was a warning), by the check's own rule: any shared stretch of one wall, a window above a door too, and its line is the opening the check would leave out. `rooms/check` is a problem when the check would find an error on a part the writer worked out, and a warning for any other note the check makes on the plan as written (a part written `raw` is never refused), each with the check's code and words. `rooms/hole` warns of floor the rooms close round that no room claims, with where it is and the rooms round it. `rooms/wall-from-gap` warns of a wall whose thickness is the gap two rooms leave and no line states.
- The check: a wall stated exterior is said to have rooms on both its sides (`wall/kind-differs`) only where rooms are; a face that looks into another wall's body at a joint is not a room. A short wall overlapping the end of an angled one still faces outside past it.
- No new code in the record.
