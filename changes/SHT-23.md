# 2026-11-26: sections and elevations on the client and check sheets (SHT-23)

## For people

- `grid sheet` now follows the floor plans with an elevations page, every side of the building, and a sections page, sections A and B, all at one true scale on A3 with a scale bar and a title block. The section lines are marked on every floor plan of the sheet (SHT-23).

## For agents

- `grid_sheet` with layout client or check writes two more pages after the floors, listed in `pages` with the kinds `elevations` and `sections`. Grid chooses the section lines: A along the building's longer side and B across it, through the largest room of the lowest floor; the floor plans on the sheet mark them. The check sheet's sections page lists what the sections took that the plan does not state, and may run onto a continuation page. No new code in the record.
