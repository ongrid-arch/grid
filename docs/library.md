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

The typical rooms are `bathroom` (a bath, a WC and a basin in 2.40 × 1.90 m), `cloakroom` (a WC
and a small basin in 1.00 × 1.60 m), `double-bedroom` (a double bed, two side tables and a
wardrobe in 3.20 × 3.40 m) and `single-bedroom` (a single bed, a side table and a wardrobe in
2.40 × 3.00 m). In each, every item and the clear floor each keeps are clear of the others.

A bed's back is its head, so its width is across the head and its depth its length; its clear
floor is at its foot. Fixtures take the floor they stand on from a room's free floor
([areas.md](areas.md#free-floor)); furniture can be moved and takes none.

## Placing by name

`grid_place_item` (`grid edit place`) puts an entry in the plan by name, at `x` and `y`: an
item's middle, or a typical room's inside back-left corner, whose items are set out from there.
Unturned, an item's back faces down the drawing (-y); `turn` turns it, or the whole typical room
about its corner, counter-clockwise in degrees.

```bash
grid edit place --name double-bedroom --x 0.1 --y 0.1
grid edit place --name wc --x 5.55 --y 0.33 --turn 90
```

The answer names the room each item landed in and whether it fits: a wall it runs into, an item
it stands in, the clear floor in front of one that something blocks, a doorway it stands in
front of, a door that swings into it. It is written either way, and `grid check` keeps the
note. `grid_measure what=fit room=bed1 name=double-bed` tries the entry's own size with its
clear floor in front (1.40 × 2.60 m for a double bed), so "will a double bed fit" gets the same
answer every time.

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

Any item may state `clearance` itself, with or without a library entry. Every other field is
in [plan-file.md](plan-file.md#fixtures).

## What Grid checks

Each is worth a look; the item is drawn and measured either way.

| Code | What it says |
|---|---|
| `item/unknown-library` | The item names an entry no library holds. It is drawn from what it states; one that states no size is left out by the reading |
| `item/overlap` | It stands in another item by more than 5 mm (`itemOverlap`) |
| `item/leaves-room` | More than 0.005 m² of its footprint lies past its room's edge where no wall stands (`itemLeavesRoom`) |
| `item/clearance-blocked` | A wall, or another item, stands in the clear floor it keeps in front of it |

These come with the checks every item has, in [plan-file.md](plan-file.md#fixtures).

## The DXF: each door and fixture a block

The DXF writes each door, window and opening as a block (one per kind and size), and each
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
