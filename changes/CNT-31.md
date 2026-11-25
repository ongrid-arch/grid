# 2026-11-25: the estimate words every use, reads back its own rate card and measures roofs, walls and floors as built (CNT-31)

## For people

- The estimate (`grid_takeoff for=estimate`) words the lines of every room use; toilets, offices, classrooms and the rest no longer read "undefined" (CNT-31).
- The rate card Grid writes, filled in and saved as `rates.json`, is read back as it is: keys for named wall, door and window types and for named finishes, in capitals, with spaces or accents, are taken (CNT-31).
- A floor that states a sloped roof has its roof priced on the slope, and the estimate gives the ridge, eaves, verge and hip lengths a roof kit is ordered by (CNT-31).
- Walls are measured between the faces of the walls they butt into, so a partition is no longer counted into the wall it meets; an upper floor's structure leaves out its stair wells and lift shafts; an open deck or terrace gets no slab, roof or ceiling (CNT-31).

## For agents

- `grid_takeoff for=estimate`: new lines `ridge`, `eaves`, `verge` and `hip` (m, assumed, with `floors`) for the sloped roofs the floors state. `roof` is on the slope where a floor states a sloped roof (its `what` reads "Roof, on its slope, …" with each floor's shape and pitch), and none is laid where the plan states more of the building above, as `grid_takeoff` does.
- `wall:<kind>:<thickness>` and `wall-type:<id>:<thickness>` lines are the walls' lengths between the faces of the walls they meet (the centre line at a corner), so interior walls and partitions that butt into others come out shorter than before. `upper_floor` takes off each slab opening over a stair, a stair room, a lift or a ramp; `slab`, `upper_floor` and `roof` come from the same envelope as the take-off, so an open outdoor space has none, and `ceiling` leaves it out.
- A rates file's key is a word in small letters (now with `-`, as in `wall-type`), then anything after a colon, up to 200 characters: every key the rate card writes is taken. No new code in the record.
