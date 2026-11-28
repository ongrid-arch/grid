# 2026-11-28: the measures of the work, and the area figures a country quotes (ARE-79)

## For people

- `grid_measure what=work` gives the numbers a question about an extension turns on, for any country, as measures with no rule applied: how far the new parts reach past the old outline on each side and how wide they are, the floor and footprint they add, the tops of their walls and the highest point over them above the ground, their volume, the plot left unbuilt before and after, and how far they are from each edge of the boundary (ARE-79).
- `grid_areas` gives the figures people quote where the plan will be built: for Spain the useful area and the built area without and with the shared parts, flat by flat; for the US the living area under air above the ground, so a heated basement is not in the headline (ARE-79).

## For agents

- `grid_measure` takes `what=work`, with no other argument. Its `answer` says `measures: "geometry"` and `ruleApplied: false`; on a plan with phases it holds `newRooms`, `newWalls`, `footprint` (`before`, `after`, `added`), `depths` (each `faces`, `direction`, `depth`, `across`), `area` (`grossExternal`, `grossInternal` and `net`, each `existing`, `proposed`, `change`), `heights` (`wallsLowest`, `wallsHighest`, `walls`, `highest`, `underRoof`), `volume` and `rooms` (each `room`, `name`, `floor`, `area`, `volume`, `underRoof`), `plot` (`area`, `before`, `after`, or null with no boundary) and `edges` (each `edge`, `name`, `faces`, `added`, `before`, `after`); with no phases, `phased: false` and a line on how to mark them. No line says whether the work needs permission.
- `grid_areas` answers with `local` for a plan built in Spain (`country: "ES"`, `useful`, `built`, `builtShared`, and `flats`, each `id`, `name`, `useful`, `built`, `builtShared`) or the US (`country: "US"`, `aboveGround`, `floors`, `conditioned`), with its lines before the net line; elsewhere `local` is absent. No new code in the record.
