# 2026-11-25: a drawing's project name and title from the sheet words (SHT-18)

## For people

- A drawing at a scale takes its title from the sheet words too: add `"drawing": "Ground floor, as built"` to `<plan>.sheet.json` and the title block shows it in place of "Ground floor plan". The project name there is the words' `name`, as before (SHT-18).

## For agents

- `grid_sheet` with `layout: drawing` reads the `sheet` words as the CLI's `--sheet` does: `name` is the project in the title block and the new `drawing` field (at most 120 characters) is the drawing's title there, Grid's own title when left out. The tool's description and the `sheet` argument now say so; before, the argument read "Client only". A client sheet ignores `drawing`; a check sheet still takes no words. No new code in the record.
