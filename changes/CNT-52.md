# 2026-11-27: point assets, a fire and wayfinding set, item facts and tags in the key (CNT-52)

## For people

- Points: an extinguisher, a defibrillator (AED), a fire alarm call point, a first aid point, a sensor, a desk point, a game's spawn point and a camera, and a fire and wayfinding set (you are here, a hose reel, a fire door's mark, an exit, a refuge and an assembly point), each drawn with a symbol of its own. Place one with `item fe1 extinguisher at 2,3` in rooms text or `grid_add_item name=extinguisher x=2 y=3`. A point can sit on a wall or outside the building without a warning (CNT-52).
- A drawing that shows points has a key with one entry for each kind, drawn with its symbol. A tag with words is listed in the key by its number, and the notes stay under the notes.
- Any item can carry facts of your own, such as an extinguisher's type and service date. They are written into the DXF and the IFC, and `grid_schedule of=items` lists every item with its place and facts.

## For agents

- The plan file: `POINT_KINDS` (`extinguisher`, `aed`, `call-point`, `first-aid`, `sensor`, `desk-point`, `spawn`, `camera`, `you-are-here`, `hose-reel`, `fire-door`, `exit`, `refuge`, `assembly-point`) are item kinds of the new group `point`, each with a built-in library entry of its own name. An item may carry `properties`, facts of the person's own (C6, C9 and C30 widened, no new convention number). The checks on where an item stands (`item/outside-rooms`, `item/into-wall`, `item/leaves-room`, `item/overlap`, `item/clearance-blocked`) never name a point. `item/unknown-kind` no longer says points come later.
- `grid_add_item` takes `facts` (by name: text, a number, or true or false) and places points; for a point its answer says "It is a point" in place of "It fits".
- `grid_fields`, `grid_find` and `grid_count` take `point` as a kind of part (and `item` now means fixtures, furniture and points) and read an item's facts.
- `grid_schedule` takes `of=items`: every item numbered in plan order with its kind, group, label, floor, room, place, size, height, turn and facts, the count of each kind, and what was left out; as text or CSV.
- `grid_describe` lists the points after the furniture (`Points: 2 extinguishers, 1 camera.`); the agent's line is headed `Items` when the plan has points.
- The drawing's key: one entry per point kind shown and one per tag with words (by its number); a tag listed there is not listed again under the notes, whose numbers do not change. A drawing with points or tags now has a key unless the key is turned off. Points are drawn over the walls.
- The DXF writes an item's facts on the facts layer at its middle; the IFC writes them in `Grid_Properties`. No new code in the record.
- Left for later: a point as a GLB node with no mesh; it is a small block at its height for now.
