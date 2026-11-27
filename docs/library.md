# The library: fixtures, furniture and typical rooms by name

Read this when you place a fixture, a piece of furniture or a whole room's worth of them, keep an
office's own standard sizes, or add a kind of thing to Grid.

- [What the library holds](#what-the-library-holds)
- [Placing by name](#placing-by-name)
- [An office's own library](#an-offices-own-library)
- [In the plan file](#in-the-plan-file)
- [What Grid checks](#what-grid-checks)
- [The DXF: each door and fixture a block](#the-dxf-each-door-and-fixture-a-block)
- [Adding a kind of thing](#adding-a-kind-of-thing)

## What the library holds

A library entry is a named size of a thing: its kind, its width along its back and its depth to
its front, its height, and the clear floor it keeps in front of it (`clearance`, as wide as it
is). A typical room is a set of entries laid out from a room's inside back-left corner, with the
room size it was laid out for. `grid_measure what=library` lists every entry and where its size
comes from; with `name`, one entry and what its kind is.

Grid's own entries are its own sizes, plain common sizes written for this library and read from
no document, so each says "Grid's own size, not a code figure". None is a code's figure or a
maker's: work to those in an office library, with the source of each. A built-in name never
changes size once released, so a plan that names `double-bed` reads the same bed in every
version; a new size is a new name.

| Kind | Entries |
|---|---|
| toilet | `wc` 0.40 × 0.65, `wc-compact` 0.36 × 0.60 |
| basin | `basin` 0.55 × 0.45, `basin-small` 0.45 × 0.35 |
| shower | `shower-800`, `shower-900`, `shower-1200` (1.20 × 0.80) |
| bath | `bath` 1.70 × 0.70, `bath-1500` |
| kitchen run | `kitchen-run-2400`, `kitchen-run-3000` (0.60 deep, 1.20 clear in front) |
| bed | `single-bed` 0.90 × 2.00, `double-bed` 1.40 × 2.00, `large-double-bed` 1.60 × 2.00, `king-bed` 1.80 × 2.00 |
| table | `side-table` 0.45 × 0.40, `bedside-table` 0.40 × 0.35, `coffee-table` 1.10 × 0.60, `dining-table-4` 1.20 × 0.80, `dining-table-6` 1.80 × 0.90 |
| chair | `chair` 0.45 × 0.50 |
| stool | `stool` 0.35 × 0.35, `bar-stool` 0.40 × 0.40 (0.75 high) |
| armchair | `armchair` 0.80 × 0.85 |
| sofa | `sofa-2` 1.60 × 0.90, `sofa-3` 2.10 × 0.90 |
| storage | `wardrobe` 1.00 × 0.60, `chest-of-drawers` 0.80 × 0.45, `tv-unit` 1.60 × 0.45 |
| desk | `desk` 1.20 × 0.60, `desk-1400` 1.40 × 0.70 (0.75 clear in front) |
| rug | `rug` 2.00 × 1.40, `rug-large` 3.00 × 2.00 |
| plant | `plant` 0.50 × 0.50 (1.20 high) |

Equipment (CNT-47), each a fixture that takes the floor it stands on, one entry of each kind by
its kind's name: `rack` 0.60 × 1.20 (2.00 high, 1.00 clear in front), `generator` 3.00 × 1.20,
`pump` 0.60 × 0.60, `tank` 1.50 × 1.50, `seat` 0.50 × 0.60, `pew` 3.00 × 0.60, `altar` 2.00 ×
1.00, `fume-cupboard` 1.50 × 0.90 (2.40 high), `lab-bench` 3.00 × 0.75, `safety-shower` 1.00 ×
1.00, `kennel` 0.90 × 0.90, `exam-table` 1.20 × 0.60 and `clinical-sink` 0.90 × 0.60. Any other
thing is the kind `equipment`, which has no entry: give it its size, height and label.

Bathroom and kitchen fittings (CNT-55), each a fixture, one entry of each kind by its kind's
name: `bidet` 0.36 × 0.55, `urinal` 0.40 × 0.35 (0.60 high, hung 0.35 up), `vanity` 0.80 × 0.50,
`double-basin` 1.20 × 0.50, `towel-radiator` 0.50 × 0.10 (1.20 high, hung 0.15 up),
`shower-screen` 0.90 × 0.02 (2.00 high), `sink` 1.00 × 0.50 and `hob` 0.60 × 0.50 (each set into
a 0.90 m worktop: 0.20 high hung 0.70 up, and 0.03 high hung 0.88 up), `oven` 0.60 × 0.60,
`fridge` 0.60 × 0.65 (0.85 high) and `fridge-freezer` 0.60 × 0.65 (1.80 high), `tall-unit` 0.60 ×
0.60 (2.10 high), `wall-unit` 0.60 × 0.35 (0.72 high, hung 1.45 up), and a commercial kitchen's
`range` 0.90 × 0.90, `fryer` 0.40 × 0.80, `prep-table` 1.80 × 0.70, `dishwasher` 0.70 × 0.75
(1.50 high) and `hood` 1.80 × 1.00 (0.60 high, hung 2.00 up), each drawn with its label inside
it. `wall-hung-wc` is a toilet 0.36 × 0.54, 0.22 high, hung 0.20 up. An entry may carry an
`elevation` as an item does, metres from the floor to its underside, and an item placed from it
takes it. A sink, a hob and a shower screen are set into or onto another item, so they stand in
none. A kind may be named by a plain word for it, as a room's use may: `WC`, `loo` and
`lavatory` are a toilet, `tub` a bath, `washbasin` a basin, `fridge-freezer` a fridge, `cooker`
an oven, `wall cabinet` a wall unit.

Points (CNT-52), which take no floor, one entry of each kind by its kind's name, the size its
symbol is drawn at and the height it is shown at: `extinguisher` 0.40 × 0.40 (1.00 high), `aed`
0.40 × 0.40 (1.20), `call-point` 0.30 × 0.30 (1.40), `first-aid` 0.40 × 0.40 (1.40), `sensor`
0.30 × 0.30 (2.40), `desk-point` 0.40 × 0.40 (0.75), `spawn` 0.60 × 0.60 (0.05), `camera` 0.30 ×
0.30 (2.60), `you-are-here` 0.50 × 0.50 (1.60), `hose-reel` 0.50 × 0.50 (1.40), `fire-door` 0.40 ×
0.40 (2.10), `exit` 0.40 × 0.40 (2.20), `refuge` 0.50 × 0.50 (1.20) and `assembly-point` 0.60 ×
0.60 (2.00).

Child-size entries, for a nursery or a school: `wc-child` (a toilet, 0.32 × 0.50, 0.35 high),
`basin-low` (a basin, 0.45 × 0.35, 0.55 high), `cot` (a bed, 0.66 × 1.26, 0.95 high), `nap-cot`
(a bed, 0.60 × 1.30, 0.15 high), `changing-table` (a table, 0.90 × 0.70, 0.90 high), and
`coat-rail` (1.20 × 0.40, 1.70 high) and `coat-rail-low` (1.20 × 0.30, 1.10 high), both storage.

The typical rooms are `bathroom` (a bath, a WC and a basin in 2.40 × 1.90 m), `shower-room` (a
shower, a WC and a basin in 2.10 × 1.80 m, CNT-48), `cloakroom` (a WC and a small basin in
1.00 × 1.60 m), `kitchen` (a 3.00 m kitchen run in 3.00 × 2.40 m, CNT-48), `double-bedroom` (a double bed, two side tables and a
wardrobe in 3.20 × 3.40 m) and `single-bedroom` (a single bed, a side table and a wardrobe in
2.40 × 3.00 m). In each, every item and the clear floor each keeps are clear of the others. Two
sets are for filling a café or a meeting room (CNT-44): `table-4-chairs` (a table for four with
two chairs on each long side, 1.20 × 1.80 m) and `table-6-chairs` (a table for six, three chairs
a side, 1.80 × 1.90 m).

A bed's back is its head, so its width is across the head and its depth its length; its clear
floor is at its foot. Fixtures take the floor they stand on from a room's free floor
([areas.md](areas.md#free-floor)); furniture can be moved and takes none.

## Placing by name

`grid_add_item` with a typical room's name and a room, and no side or point, sets out that room's
usual fixtures in it in one call (CNT-48): each item against a side of the room, longest side
first, in a corner and then centred, where Grid's checks find it clear of the walls, the doors'
swings and ways through, the other fixtures and the clear floor each keeps. Where the typical
room's own size fits nowhere, a smaller one of the same thing is tried (a 2.40 m kitchen run for a
3.00 m one, a 1.50 m bath, then a shower, for a bath; a small basin, a compact WC), and the answer
says so. A kind the room already holds is not added again, and `notPlaced` lists what fits
nowhere. It is a first set-out to move from, not a layout rule.

```text
grid_add_item name=bathroom room=bath
grid_add_item name=kitchen room=kitchen
```

`grid_place_item` (`grid edit place`) puts an entry in the plan by name, at `x` and `y`: an
item's middle, or a typical room's inside back-left corner, whose items are set out from there.
Unturned, an item's back faces down the drawing (-y); `turn` turns it, or the whole typical room
about its corner, counter-clockwise in degrees.

```bash
grid edit place --name double-bedroom --x 0.1 --y 0.1
grid edit place --name wc --x 5.55 --y 0.33 --turn 90
```

An item may take its own figures: `width` and `depth` (together), `height`, `clearance` and
`label`. They are written on the item beside its library name, and the entry fills the rest, so
a 1.40 × 0.70 m desk is `desk` at its own size and a plan still reads it as a desk. A thing the
library has no entry for is placed by its kind with its width, depth and height: a kennel as
`storage`, an exam table as `table`. A typical room takes none of these, as it is many items:
place its items one by one to size them.

```bash
grid edit place --name desk --x 2 --y 1 --width 1.4 --depth 0.7
grid edit place --name storage --id kennel-1 --x 1 --y 3 --width 1.2 --depth 0.9 --height 0.9 --label Kennel
```

The answer names the room each item landed in and whether it fits: a wall it runs into, an item
it stands in, the clear floor in front of one that something blocks, a doorway it stands in
front of, a door that swings into it. It is written either way, and `grid check` keeps the
note. `grid_measure what=fit room=bed1 name=double-bed` tries the entry's own size with its
clear floor in front (1.40 × 2.60 m for a double bed), so "will a double bed fit" gets the same
answer every time.

## Filling a room at a pitch

`grid_fill_room` (CNT-44) answers "how many desks fit in the hot-desk zone" and places them in
one call: it repeats one entry, an item or a set, over a room or a zone of an open-plan room.

| Argument | What it sets | Left out |
|---|---|---|
| `pitch` | Metres from one module's middle to the next along a row | The module's width: side by side |
| `aisle` | The clear way between a row's modules, with the floor they keep in front, and the next row | 0.90 m, Grid's own figure |
| `back_to_back` | Rows in pairs, back to back, as bench desks are | Rows all facing one way |
| `turn` | The rows' turn, counter-clockwise: 0 runs them along x with the backs to -y | The one that fits most of 0°, 90°, 180°, 270° and square to the room's longest side |
| `wall_clearance` | Metres kept clear of the room's walls and edges | 0 m |
| `door_clearance` | Metres kept clear in front of each door and doorless opening, both sides of its wall | 1.20 m, Grid's own figure |
| `count` | The most modules placed; the answer says how many short | As many as fit, at most 1,000 |

A module is the entry with the clear floor it keeps in front (a desk and its chair's floor,
1.20 × 1.35 m for `desk`), or a set's size. A place is kept when the module lies inside the room's
inside outline, grown by the wall clearance, and stands clear of each door's floor, each column
and each item already there; Grid's own fit checks (the ones `grid_place_item` answers with) then
take out any module they name. The lattice is tried with its slack at the near edge, the middle
and the far edge both ways, and the set-out that fits most is kept.

The modules are written as one group: `desk-1` … `desk-48`, or `cafe-1-1` … for a set's items
(`group` names it). The answer gives the count, against `count` when given, the rows and the
most in a row, the room's area over the count, what is left over along and across the rows, and
how many places a door, a column, an item, the room's shape or Grid's checks took. `dry_run`
answers the same and writes nothing; `replace` takes the group's earlier items out and fills
again, so trying another pitch is one more call. A plan that already holds the group is refused
without `replace`.

```bash
grid edit fill --room hot-desks --name desk --pitch 1.6 --aisle 1.2 --back-to-back --dry-run
```

## An office's own library

An office keeps its own entries in a `library` folder beside the plan: every `.json` file in it,
read in name order, each `{ "version": "1", "items": [...], "rooms": [...] }`.

```json
{
  "version": "1",
  "items": [
    { "name": "our-wc", "kind": "toilet", "size": [0.38, 0.7], "height": 0.8, "clearance": 0.75, "label": "WC", "source": "Office standard sheet 4, 2025" }
  ],
  "rooms": [
    { "name": "our-cloakroom", "label": "Cloakroom", "use": "toilet", "size": [1.0, 1.7],
      "items": [ { "library": "our-wc", "at": [0.4, 0.35] }, { "library": "basin-small", "at": [0.825, 1.3], "turn": 90 } ] }
  ]
}
```

A name is looked for in the plan's own library first, then the office's files, then Grid's, so an
office's `wc` stands in for Grid's. An entry placed from the folder is copied into the plan's
own `library`, as a CAD drawing keeps the blocks inserted into it: the plan reads the same
without the folder, and a later change to the office's file changes no plan already drawn. A file
that cannot be read is named in the answer with why, and the others are read. The folder is
inside the project, as every file Grid reads is: keep the office's library in each project,
copied or checked out there.

## In the plan file

An item may name its entry in `library` and leave out what the entry gives: its `kind`, `size`,
`height`, `clearance` and `label` (convention C30). A value the item states itself is kept. The
reading lists what the entry filled in `fromLibrary`, which is Grid's reading only and never
written back, so a plan written back keeps only what it stated.

```json
"items": [
  { "id": "bed", "library": "double-bed", "at": [1.7, 1.1] },
  { "id": "wc", "library": "our-wc", "at": [5.55, 0.33], "turn": 90 }
],
"library": [
  { "name": "our-wc", "kind": "toilet", "size": [0.38, 0.7], "height": 0.8, "clearance": 0.75, "label": "WC", "source": "Office standard sheet 4, 2025" }
]
```

Any item may state `clearance` itself, with or without a library entry, and (CNT-47)
`clearSides`, the clear floor it keeps behind it (`back`, as wide as it is) and at its own left
and right (`left`, `right`, as deep as it is), facing out of its front. Every other field is
in [plan-file.md](plan-file.md#fixtures).

## What Grid checks

Each is worth a look; the item is drawn and measured either way.

| Code | What it says |
|---|---|
| `item/unknown-library` | The item names an entry no library holds. It is drawn from what it states; one that states no size is left out by the reading |
| `item/overlap` | It stands in another item by more than 5 mm (`itemOverlap`) |
| `item/leaves-room` | More than 0.005 m² of its footprint lies past its room's edge where no wall stands (`itemLeavesRoom`) |
| `item/clearance-blocked` | A wall, or another item, stands in the clear floor it keeps in front of it, or behind it or at a side (CNT-47) |

These come with the checks every item has, in [plan-file.md](plan-file.md#fixtures).

## The DXF: each door and fixture a block

The DXF writes each door, window and opening as a block (one per schedule type, VEW-72), and each
fixture and piece of furniture as one too: one block per library entry, or per kind and size for
an item placed without one, named `GRID-DOUBLE-BED-1400x2000` or `GRID-TOILET-400x650`, drawn
in the item's own frame and inserted at its middle on the fixtures layer, turned as the plan turns
it. A CAD program counts them by block and swaps one for all of them.

## Adding a kind of thing

Every kind is one entry of the kinds registry (`packages/floorplan/src/geometry/itemKinds.ts`):
its group (a fixture, which takes free floor, or furniture), its word, what an agent is told of
it, its plain symbol in shares of its footprint and any checks of its own. The 2D drawing, the
sheet, the DXF and IFC exports, the counts and measures and the drawing's check read a kind only
through the registry, so a new kind is one entry. Grid's own kinds are
`ITEM_KIND_DEFINITIONS`; another program adds one with `registerItemKind`:

```ts
import { registerItemKind } from '@ongrid/floorplan/geometry'

registerItemKind({
  kind: 'piano',
  group: 'furniture',
  word: 'piano',
  about: 'An upright piano: its back against the wall, its keys at its front.',
  symbol: (p) => ({ rings: [p.box(-0.5, -0.5, 0.5, 0.5)], lines: [[p.point(-0.5, 0.2), p.point(0.5, 0.2)]] }),
  check: (item) => (item.height > 1.2 ? [{ code: 'item/piano-tall', severity: 'warning', message: `Piano "${item.id}" is a tall upright.` }] : []),
})
```

A kind added this way is said in its own words: its word in the drawing's labels and the counts,
and its checks' lines as it gives them. A kind of Grid's own also has its words in the message
files ([languages.md](languages.md)). The IFC writes every kind as an `IfcFurnishingElement`
with its kind as its type. Every item has the same shape in the plan file (C6), and the library
gives its size.
