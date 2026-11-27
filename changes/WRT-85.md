# 2026-11-27: a base plan's columns, grids, stairs, fixtures and floor levels read into its fit-out (WRT-85)

## For people

- A fit-out on a base plan now shows and measures the whole shell: the base's columns and structural grid, its stairs and its fixtures (a chimney breast, a WC kept) are drawn, counted and exported with the fit-out, and the columns take their floor off the fit-out's rooms. A floor the fit-out lists keeps the base's levels, slab, outline and roof where it says none. They stay the base's: nothing is written into the fit-out, and moving or taking out one of them is refused, as a base wall is (WRT-85).

## For agents

- In a plan that names a `base`, every reading tool (`grid_view`, `grid_areas`, `grid_count`, `grid_find`, `grid_check`, `grid_export`, `grid_sheet` and the rest) now reads the base's `columns`, `grids`, `stairs` and `items` after the fit-out's own; they carry no phase, so they stand before and after the work. A fit-out floor with a base floor's id takes the base's `level` (when the fit-out's reads 0), `elevation`, `height`, `slab`, `parapet`, `roof`, `outline`, `above` and `below` where it states none. A fit-out column, grid, stair or item with the id of the base's of the same kind refuses the plan, naming it, in the words a clashing wall id is refused in, now "the base plan's parts". `grid_move_item`, `grid_remove_item`, `grid_set` and the other changes refuse to touch a base column, grid, stair or item with "That change would touch the base plan ...", writing nothing; `grid describe --as rooms` reads none of them back as the fit-out's. Bays and ramps are not read in. No new code in the check record.
