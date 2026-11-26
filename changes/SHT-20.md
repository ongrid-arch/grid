# 2026-11-26: every floor at one stated scale, and a long floor over pages (SHT-20)

## For people

- `grid sheet --scale 1:100 --paper A3` now draws every floor of the building, one page each, all at 1:100 on A3, each with its scale bar and north arrow, in one PDF, with an SVG and a PNG of each page (`-page-1`, `-page-2`). `--floor` still draws one floor alone. A floor too large for the paper is refused by its name, with a paper and a scale that fit and the number of pages `--split` would take; `--split` cuts it into parts at the scale, one to a page, each saying which part it is, with a dashed line where the next part continues (SHT-20).

## For agents

- `grid_sheet` with `layout: drawing` and no `floor` draws every floor at one scale on one paper, the scale and paper every floor fits, where it drew the lowest floor alone before. `pages` lists each page with its `floor`, and `part` and `parts` when the floor is split; the new `svgs` and `pngs` list every page's files (`svg` and `png` stay the first page's), and every page's PNG comes back to look at (`image`, then `images`). The first line of the answer says how many pages there are. The new `split: true` cuts a floor too large for the paper over pages at the scale (A0 when no paper is given). A refusal for a floor too large names the floor on a plan of several and adds "or split true prints it at 1:N over K pages of A4". A plan of one floor answers as before, with `svgs` and `pngs` of its one page. No new code in the record.
