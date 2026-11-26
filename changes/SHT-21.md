# 2026-11-26: a client sheet fitted to the building's kind and size (SHT-21)

## For people

- A client sheet's cover leads with the figures the building is judged by: a station's platforms
  and gates, a hospital's beds and operating theatres, a shed's loading doors and the clear height
  of its tallest room, a concert hall's seats and the clear height of its hall, a block of flats'
  homes and bedrooms. It never says "0 bedrooms" of a building with no reason to have any, and a
  mezzanine or a terrace inside a taller storey no longer gives the floor to floor. The cover adds
  the height to the roof, the gross external area and, with a site boundary, the floor area ratio,
  prints six figures at most (the rest in one line) and says its rounding rule once (SHT-21).
- Rooms alike on a client floor are one row: sixty bedrooms of one size are "60 × Bedroom", with
  the area of each and their sum.
- Alike floors are printed once, as a typical floor naming the floors it stands for, followed by an
  area schedule by floor and by use: a tower of forty alike floors is a few pages, not forty.

## For agents

- `grid_sheet` with `layout=client` returns fewer pages for a plan with alike floors: a typical
  floor's page has the title "Typical floor" (or "Typical floor 2" and on, with several sets), its
  `floor` is the lowest of the floors it stands for, and two pages titled "Area schedule" follow
  the floors. The check layout is unchanged: one page per floor.
- The client cover's figures depend on the plan's `building` and each floor's: no figure is
  "0 bedrooms" unless the plan is a home or a block of flats. New figure labels: homes, guest
  rooms, beds, operating theatres, platforms, gates, classrooms, seats, loading doors, cells,
  parking spaces, "clear height, <room>", height to the roof, buildings and floor area ratio.
- No new code in the record.
