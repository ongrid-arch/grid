# 2026-11-25: courtyards open to the sky, and canopies roofed (LVL-12)

## For people

- A courtyard is the outside. Floor no room claims that a window looks into, or that lies over an
  open courtyard on the floor below, has no slab and no roof in the 3D view, the exports and the
  section, its walls are outside walls, and the check no longer calls it floor no room claims. A
  courtyard or light well over open sky has no slab on any floor it rises through. Rooms text
  writes the wall between a room and a courtyard or a terrace as an outside wall, at the outside
  thickness. A canopy on columns drawn on its own has its roof, at its stated height or its
  columns' (LVL-12).

## For agents

- `floor/unclaimed` is no longer said for floor open to the sky: a space no room claims that a
  window in a room's wall looks into, or whose greater part lies over an unroofed outdoor space
  (or such open floor) on the floor below. A wall beside it reads `exterior` in every exposure
  (2D, 3D, DXF layers, IFC `IsExternal`), and the slabs and roofs (`grid_measure`'s take-off, the
  3D, the IFC, the section) leave it out. The areas still count it as floor no room claims.
- An outdoor `courtyard` or `light-well` with no roof, above the lowest level and over open sky
  below, has no slab under it; other outdoor kinds above the lowest level keep theirs.
- `grid_write_rooms` and `grid write`: a wall rooms text works out between a room and an outdoor space
  is `exterior`, and a room placed beside one is set off by the outside thickness when no line
  states it. Rooms placed after it move by the difference.
- A floor whose only roofed part is outdoor space (a canopy) has a roof: at the space's `height`,
  else its tallest column's, else the storey's. No new code in the record.
