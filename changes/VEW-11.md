# 2026-11-25: stairs cut in a section with their waist and soffit (VEW-11)

## For people

- A section that cuts a stair now draws each flight as it is built: its treads and risers on a
  sloped waist, with the soffit line beneath, joined to its landings, which are slabs. A flight
  is no longer a solid wedge down to the floor, so the room under a stair stays open and what
  lies beyond it shows. Seen beyond the cut, a flight's side shows the same profile. The section
  lists the waist it takes (0.15 m), since the plan states none (VEW-11).

## For agents

- A section's stair part (`grid_view` with a section, `grid draw --section`) is one shape per
  flight cut, its treads and risers over the waist, and a slab per landing, not a block per tread
  solid from the floor. Its list of what Grid takes gains one line, `waist`, for every stair cut.
  No new code in the record.
