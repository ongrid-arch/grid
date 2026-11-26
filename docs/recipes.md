# Recipes

Read this when you know what you want to make and not yet which calls to make: a plan for a
property listing, a house over three floors, a shop with zones, or a plot with a building on it.
Each recipe is the rooms text to start from and the calls that follow it. The rooms text is
checked by a test, so it writes with no problem; change the sizes, keep the shape. The whole
language is in [rooms-first.md](rooms-first.md#the-whole-grammar), and the tools are in
[tool-server.md](tool-server.md).

## A flat for a property listing

A listing needs the rooms with their sizes, the areas as people read them, a picture and a
sheet to hand over.

```rooms
plan "Flat 4, Harbour House"
building flat
display m
walls outside 0.3 inside 0.1
room living "Living room" living 5.0 x 3.8 at 0,0
room kitchen "Kitchen" kitchen 3.0 x 3.8 east of living open
room hall "Hall" corridor 1.2 x 3.0 north of living align west
room bed1 "Bedroom 1" bedroom 3.9 x 3.0 east of hall
room bath "Bathroom" bathroom 2.0 x 2.4 north of bed1 align east
door front in hall west, centred, 0.9 wide, opens in
door d-bed between hall and bed1, centred, 0.8 wide, opens into bed1
door d-bath between bed1 and bath, centred, 0.7 wide, opens into bath
opening o-living between living and hall, centred, 0.9 wide
window w-living in living south, centred, 2.0 wide
window w-kitchen in kitchen south, centred, 1.2 wide
window w-bed in bed1 east, centred, 1.4 wide
```

1. `grid_write_rooms` writes it. Read the answer's `guesses` and `warnings` before anything else.
2. `grid_check` says what is worth a look. A listing is a claim to buyers: fix what it names.
3. `grid_areas` gives each room's net area and the gross internal area. Say which of the two a
   figure is when you quote it ([areas.md](areas.md)).
4. `grid_view` draws the plan, and `grid_sheet` with `layout` `client` writes the A3 sheet into
   `exports/`.

## A house over three floors

Write the ground floor once, copy it up, and let the stair stand through the floors it joins.

```rooms
plan "Three-storey house"
building house
walls outside 0.3 inside 0.1
floor ground "Ground floor" level 0 elevation 0 height 2.75
room hall "Hall" corridor 2.0 x 4.5 at 0,0
room stair "Stair" stair 1.1 x 4.5 east of hall through second
room living "Living room" living 4.5 x 4.5 east of stair
room kitchen "Kitchen" kitchen 3.4 x 4.5 north of hall align west
door front in hall south, centred, 0.9 wide, opens in
opening o-stair between hall and stair, 0.3 from south, 1.0 wide
door d-living between stair and living, centred, 0.9 wide, opens into living
door d-kitchen between hall and kitchen, centred, 0.9 wide, opens into kitchen
window w-living in living south, centred, 2.4 wide
floor first "First floor" level 1 elevation 3.0 height 2.75 copy ground with openings
floor second "Second floor" level 2 elevation 6.0 height 2.75 copy first with openings
raw floor {"roof": {"shape": "gable", "eaves": 2.7, "ridge": 5.0, "ridgeRuns": "east-west"}}
```

1. `grid_write_rooms` writes it. A copied floor keeps the rooms and, with `with openings`, the
   openings of the floor it copies; rename or change rooms with a line after the `floor` line.
2. `grid_view` with a floor draws one floor; `grid_describe` walks the building floor by floor.
3. `grid_check` finds a stair that reaches no floor or leaves no room to land on.
4. A stair that is not a stair room (a flight with its own steps and landing) is a list of the
   plan file's own: [plan-file.md](plan-file.md#stairs-that-join-two-floors).

## A shop with zones

A shop is one open space with a till, a display area and a stock room behind. Write the space
as rooms that open onto each other, then say which of them are one room.

```rooms
plan "Corner shop"
building shop
walls outside 0.3 inside 0.1 height 3.0
room sales "Sales floor" retail 5.0 x 5.0 at 0,0
room till "Till" retail 2.0 x 5.0 east of sales open
room store "Stock room" storage 7.0 x 2.5 north of sales
room wc "WC" wc 1.6 x 2.0 inside store corner nw wall 0.1
door front in sales south, 0.4 from east, 1.4 wide, opens in
door d-store between sales and store, 1.0 from west, 0.9 wide, opens into store
door d-wc in wc south, centred, 0.8 wide, opens into wc
window shopfront in sales south, 0.2 from west, 1.6 wide, sill 0.1, height 2.4
```

1. `grid_write_rooms` writes it.
2. When two rooms of different uses are one space, `grid_merge_rooms` with `zones` true keeps
   both as zones of one room: it is measured and checked as one room, and each zone is named
   and measured on its own ([plan-file.md](plan-file.md#zones-inside-one-room)).
3. `grid_areas` lists each zone under its room and counts its floor once.
4. `grid_schedule` with `of` `rooms` gives the room schedule a fit-out is priced from.

## A plot with a building on it

The plot, its street edges, its set-backs and what stands on the ground are the plan file's
`site`; rooms text has no line for it. Write the building first, then add the site to the plan
file.

```rooms
plan "House on a plot"
building house
walls outside 0.3 inside 0.1 height 2.7
room living "Living room" living 6.0 x 4.5 at 4,6
room kitchen "Kitchen" kitchen 3.5 x 4.5 east of living
room hall "Hall" corridor * x 1.5 south of living until kitchen
door front in hall south, centred, 1.0 wide, opens in
opening o-living between hall and living, centred, 1.0 wide
door d-kitchen between hall and kitchen, centred, 0.9 wide, opens into kitchen
window w-living in living north, centred, 2.4 wide
```

Then put the plot in `plan.json`, beside the building:

```json
"site": {
  "boundary": [[0, 0], [20, 0], [20, 30], [0, 30]],
  "streets": [1],
  "setbacks": [{ "from": "all", "distance": 3, "source": "given" }, { "from": "street", "distance": 5, "source": "given" }],
  "things": [{ "id": "oak", "kind": "tree", "at": [3, 22], "canopy": 5 }]
}
```

1. Add the site last. `grid_write_rooms` replaces the plan file, so a rewrite of the building
   after this needs `replace` true and is the time to put the site block back.
2. `grid_check` lists a building nearer an edge than the set-back asked for.
3. `grid_measure` with `what` `site` answers with the distance from the building to each edge
   and the plot's coverage ([tool-server.md](tool-server.md#the-plot-distances-to-the-boundary-and-the-coverage)).
   The set-backs are the person's figures, never a code's.
