# 2026-11-25: a room whose inside faces form a rectangle is read as one (ARE-34)

## For people

- A room whose inside faces form a rectangle keeps its size across by up, even when one of its sides runs partly along an outside wall and partly along an inside wall of another thickness. In a plan in feet (outside 6 in, inside 4.5 in, say), such rooms were drawn with a step a twentieth of a millimetre deep, lost their W x D in `grid describe` and the areas, and were read back as a polygon (ARE-34).

## For agents

- Two walls in a row along a side of a room whose inner faces are within 0.2 mm of each other (`flushFaces` in the tolerances table) now show the room one face. Such a room's outline has four corners: `grid describe --for agent` writes it `WxD`, not `~WxD`; `grid_areas` gives its `size`; `grid_measure` calls it a rectangle; and `grid describe --as rooms` writes it `W x D at x,y`, not `polygon`. Faces further apart are still joined by a step. No new code in the record.
