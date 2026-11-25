# 2026-11-25: a fit-out is taken off as a fit-out (ARE-55)

## For people

- The take-off of a plan fitted out in a base plan lists its own partitions, doors and finishes
  only: no slab, no roof and none of the shell's outside walls. A mid-floor office is no longer
  given a ground slab, a roof and the shell's wall (ARE-55).

## For agents

- `grid_takeoff` on a plan that names a `base`: `walls` leaves out the walls read from the base,
  and `envelope.floors` has no slab or roof, each with `why` saying they belong to the base;
  `envelope.slabs` and `envelope.roof` are null. A plan with no base answers as before. No new
  code in the record.
