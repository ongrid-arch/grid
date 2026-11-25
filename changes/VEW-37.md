# 2026-11-25: grid_compare's picture draws every floor of each option (VEW-37)

## For people

- The picture `grid_compare` draws of the options side by side now shows all of each option's
  floors, the highest at the top, with each floor's name over it, every floor at one scale. A
  two-storey house beside a one-storey villa shows both of the house's floors. Each drawing's
  own title and key are counted in the sheet's height, so the sheet's label never covers them.

## For agents

- With `picture: true` and no `floor`, the sheet holds every floor of each plan stacked in its
  column; with `floor`, that floor of each plan, as before. The stated scale (`1 m = … px`) is
  the one every floor is drawn at. No new code in the record.
