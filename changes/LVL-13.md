# 2026-11-25: no assumed roof under the ground or over a terrace's walls (LVL-13)

## For people

- Grid no longer lays its assumed flat roof over a crypt or a basement where the floor above does
  not cover it: a roof that would lie at or under the ground is left out, so the section, the 3D
  view, the GLB and the IFC draw none there. On a roof terrace or a balcony, the walls round the
  open space carry no roof, even where the same wall runs on past a stair house; a roof floor of
  open terraces alone has no roof line in the section. A roof the floor states is kept (LVL-13).

## For agents

- `grid_takeoff`'s roof lines, the section's `roofs` and parts, the 3D, the GLB and the IFC
  (`IfcRoof`) have no assumed flat roof over a floor whose roof's top would be at or under the
  ground (`site.ground`, else 0), and none over the stretches of wall that bound unroofed outdoor
  space and no room. The roof area and the section's notes change with them. A floor's stated
  `roof` is unchanged. No new code in the record.
