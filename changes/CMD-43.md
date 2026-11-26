# 2026-11-26: a DXF or IFC drawing read into rooms text (CMD-43)

## For people

- `grid write --from survey.dxf` (or a `.ifc`) reads a drawing into rooms text beside the plan
  (`<plan>.rooms`) and writes the plan from it: the rooms from their outlines, an IFC's spaces or
  the regions the wall faces close round, their names, the doors and windows by the gaps they
  stand in, and an IFC's storeys with their elevations. The answer says how each layer was read
  (`--layers` reads one otherwise), what was assumed, and each room's area against the drawing;
  `--units` sets a DXF that states no unit. Every room, wall and opening keeps its DXF handle or
  IFC GlobalId as the fact `handle` or `guid`. Check the rooms text, change a line and write it
  again with `grid write` (CMD-43).

## For agents

- `grid_write_rooms` takes `from`, a DXF or IFC drawing in the project, in place of `rooms`,
  `roomsFile`, `layout` and `scan`, with `layers` and `units` for a DXF. Its answer has a new
  field `drawing` (null otherwise): `roomsFile`, `format`, `unit`, `layers` (each layer or IFC
  class, its entity count, what it was read as and why), `areas` (each room's plan area, drawn
  area, stated area and source), `openings` (each opening's source, how it was written, its wall
  and its distance from the drawing), `factName`, `assumed` and `leftOut`. The refusals of a DXF
  or IFC file now point to `--from`; a DWG is to be saved as DXF. No new code in the record.
