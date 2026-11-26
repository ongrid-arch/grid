# 2026-11-26: grid_view says which parts to be demolished are on the floor drawn (VEW-70)

## For people

- A picture of a refurbishment with several floors now says how many of the parts to be
  demolished are on the floor shown, names them, and says which floors hold the others (VEW-70).

## For agents

- `grid_view kind=plan` on a plan with phases and more than one floor adds one line after the
  work line: "All {total} to be demolished are on this floor: …", "{here} of the {total} to be
  demolished are on this floor: …; floor "…" has {count}", or "None of the {total} to be
  demolished is on this floor: floor "…" has {count}". The work line keeps `grid_check`'s count
  for the whole plan. A plan of one floor answers as before. No new code in the record.
