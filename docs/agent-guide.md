# The guide for agents

Read this before you write your first plan with Grid. It is all an agent needs to write a valid plan without reading Grid's source: rooms first, then the raw-wall form for what rooms text cannot say, then the answers to the questions every test model asked. The tool server serves this page as the resource `grid://guide`, and the plan file's structure as the JSON Schema `grid://schema/plan`.

- [Start here](#start-here)
- [What agents ask first](#what-agents-ask-first)
- [Writing rooms](#writing-rooms)
- [The raw-wall form](#the-raw-wall-form)
- [Check, read back and change](#check-read-back-and-change)
- [Retelling what Grid says](#retelling-what-grid-says)
- [Where to read more](#where-to-read-more)

## Start here

Grid draws floor plans for any small space (a van, a cabin, a module, a container) as well as whole buildings, and gives a picture and the free-floor numbers in one or two calls: grid_view draws, grid_areas measures, and grid_export and grid_sheet make files, a whole-building 3D model (GLB) among them. Grid's tools read, measure, check, draw and change floor plans kept in plan files inside the project folder. Pass plan: the plan file, as a path inside that folder.

Before the first room, keep what the person asked for with grid_write_brief, from their own words, each wish given or assumed; every change then says which lines are met and which missed.

Work in the person's units: settle them with the brief, from their words (12 ft, 1,800 sq ft, 4 m) or their place, and ask only when neither says. Record them with a display line in the rooms text (display ft-in, display m): Grid's drawings, figures and sheets follow it, and the plan file stays in metres. A length may carry its unit in one word (360cm, 12ft, 12'6").

Write a plan rooms first, the main way to write one: name the rooms with their inside sizes and neighbours, and the doors and windows by the rooms they join, and grid_write_rooms works out the walls.

The plan file is the source of truth; rooms text is a way of writing and reading it. To change a plan, read it back with grid_describe as=rooms, change the text and write it with grid_write_rooms. Each room's boundary is derived: never edit it by hand.

The tools and the commands do the same things: `grid_write_rooms` is `grid write`, `grid_check` is `grid check`, `grid_describe` is `grid describe`. The smallest plan:

```rooms
room living  "Living room" living  4.0 x 3.5 at 0,0
room kitchen "Kitchen"     kitchen 2.5 x 3.5 east of living
door front in living south, centred, 0.9 wide, opens in
opening pass between living and kitchen, centred, 0.9 wide
window w-kitchen in kitchen east, centred, 1.2 wide
```

## What agents ask first

A room's size is to the inside faces of its walls, unless its line says centre or outside. A stair is a room used as stair on every floor it joins, in the same place (through <top floor> writes it once); a lift is a room used as lift. A room's use is one of Grid's words: an office is office, a toilet or a WC is toilet, and the room's name keeps the person's own word. Where one open space has parts, such as a kitchen open to a living room, the line between them is a dividing line with no thickness: open on the room line, or a virtual wall. An L-shaped room is one room, written with polygon and its inside corners.

### Is a size inside or outside?

Inside. A room's size is east-west by north-south, to the inside faces of its walls: the floor you walk on, which is the area Grid gives the room. `centre` after the size measures it to the walls' centre lines and `outside` to their outside faces; `sizes outside` on its own line makes that the default for every room after it. A building's footprint, measured round the outside of its walls, is its gross external area, which Grid works out from the walls (`grid_areas`); you never draw it as a room. Below, the three bedrooms are each written 3.4 x 3.0, and only the first is 3.4 x 3.0 inside:

```rooms
room bed1 "Bedroom 1" bedroom 3.4 x 3.0 at 0,0
room bed2 "Bedroom 2" bedroom 3.4 x 3.0 centre east of bed1
room bed3 "Bedroom 3" bedroom 3.4 x 3.0 outside east of bed2
door d1 in bed1 south, centred, 0.8 wide, opens in
door d2 in bed2 south, centred, 0.8 wide, opens in
door d3 in bed3 south, centred, 0.8 wide, opens in
```

Each answer says what each size was measured to, and the room's inside size.

### What do I draw for a stair?

A room used as `stair` on every floor the stair joins, in the same place, with an opening or a door from the hall or landing on each floor. `through first` on the room line writes it once and stands it on every floor after its own up to `first`. Grid follows the way out down the stair, and checks that the stair rooms lie over one another. A lift shaft is a room used as `lift` in the same way; a lift is never taken as a way out.

```rooms
floor ground "Ground floor" level 0
room hall  "Hall"  corridor 2.0 x 4.0 at 0,0
room stair "Stair" stair    1.0 x 4.0 east of hall through first
door front in hall south, centred, 0.9 wide, opens in
opening o-stair between hall and stair, 0.3 from south, 1.0 wide

floor first "First floor" level 1
room landing "Landing" corridor 2.0 x 4.0 at 0,0
opening o-landing between landing and stair, 0.3 from south, 1.0 wide
```

The flight itself, with its treads, is optional: the plan file's `stairs` list holds it (its two floors, its width and its walking line), and rooms text does not write it ([Stairs that join two floors](plan-file.md#stairs-that-join-two-floors)). A floor's `level` orders the floors (0 the ground, 1 the one above, -1 a basement); it is not a height. A floor's height is `height` on its line.

### Which word is the use for an office, a toilet or a stair?

The word after a room's name is its use, one of the words in the table below. A word in the right-hand column is read as the use on its row, in any capitals (`WC` is `toilet`), and `-` means no use. The room's name keeps the person's own word: `room wc1 "Guest loo" toilet`. The right-hand column holds the words read in other languages, Spanish, German, French and Chinese (`cocina`, `Flur`, `chambre`, `卧室`): each is a use's own name or a word that means it and nothing else. In a plan file, a word Grid does not read is named in a note and the room is read with no use, so some checks skip it; rooms text refuses it on its line, with the uses it takes. No other word is read as `bedroom`, `living` or `dining`: the room size checks look at those, so only you choose them, in your own language or Grid's. `building office` on its own line says what kind of building the plan is; a floor line takes `building shop` for one floor.

| Use | Also read as this use | In other languages |
|---|---|---|
| `bedroom` | (only this word) | `dormitorio`, `recámara`, `Schlafzimmer`, `Schlafen`, `Kinderzimmer`, `Kind`, `chambre`, `卧室`, `主卧`, `次卧` |
| `living` | (only this word) | `salón`, `sala de estar`, `Wohnzimmer`, `Wohnen`, `séjour`, `客厅`, `起居室` |
| `dining` | (only this word) | `comedor`, `Esszimmer`, `Essen`, `salle à manger`, `餐厅` |
| `kitchen` | `kitchenette` | `cocina`, `cocineta`, `Küche`, `Kochen`, `cuisine`, `厨房` |
| `bathroom` | `shower`, `showers`, `ensuite` | `baño`, `cuarto de baño`, `baño completo`, `Bad`, `Badezimmer`, `Duschbad`, `salle de bains`, `salle de bain`, `salle d'eau`, `卫生间`, `浴室` |
| `toilet` | `wc`, `loo`, `lavatory`, `restroom`, `washroom` | `aseo`, `medio baño`, `Gäste-WC`, `Toilette`, `toilettes`, `厕所`, `洗手间` |
| `utility` | `laundry`, `scullery`, `bryggers` | `lavadero`, `lavandería`, `cuarto de lavado`, `Hauswirtschaftsraum`, `HWR`, `Waschküche`, `buanderie`, `洗衣房` |
| `study` | (only this word) | `estudio`, `Arbeitszimmer`, `书房` |
| `office` | `offices`, `workspace` | `oficina`, `Büro`, `bureau`, `办公室` |
| `meeting` | `boardroom`, `conference` | `sala de reuniones`, `sala de juntas`, `会议室` |
| `reception` | (only this word) | `recepción` |
| `retail` | `shop`, `sales`, `servery` | `tienda`, `local comercial` |
| `classroom` | `teaching` | `aula` |
| `treatment` | `consulting`, `consultation`, `examination` | `consulta` |
| `waiting` | (only this word) | `sala de espera` |
| `sport` | `gym`, `fitness` | `sala de deporte`, `gimnasio` |
| `changing` | `locker`, `lockers` | `vestuario` |
| `staff` | `staffroom` | `sala de personal` |
| `worship` | `prayer`, `pooja`, `puja`, `chapel` | `sala de culto` |
| `assembly` | (only this word) | `salón de actos` |
| `corridor` | `hallway`, `passage`, `landing`, `lobby`, `circulation` | `pasillo`, `vestíbulo`, `recibidor`, `distribuidor`, `Flur`, `Diele`, `couloir`, `dégagement`, `走廊`, `过道`, `玄关` |
| `stair` | `stairs`, `staircase`, `stairwell` | `escalera`, `escaleras`, `Treppe`, `Treppenhaus`, `escalier`, `楼梯` |
| `lift` | `elevator` | `ascensor`, `elevador`, `Aufzug`, `ascenseur`, `电梯` |
| `storage` | `store`, `stockroom`, `warehouse`, `closet`, `cupboard`, `pantry`, `larder`, `wardrobe` | `almacén`, `trastero`, `despensa`, `alacena`, `bodega`, `vestidor`, `Abstellraum`, `Speisekammer`, `cellier`, `rangement`, `placard`, `储藏室`, `储物间`, `衣帽间` |
| `plant` | `plantroom`, `boiler` | `instalaciones`, `cuarto de máquinas`, `Heizraum`, `Technikraum`, `chaufferie` |
| `parking` | `garage`, `carpark` | `aparcamiento`, `garaje`, `cochera`, `车库` |
| `other` | (only this word) | `otro` |

```rooms
building office
room work "Open office" office  8.0 x 6.0 at 0,0
room wc1  "WC"          wc      1.6 x 2.0 north of work
room tea  "Tea point"   kitchen 2.4 x 2.0 east of wc1
door front in work south, centred, 1.0 wide, opens in
door d-wc between work and wc1, centred, 0.8 wide, opens into wc1
opening o-tea between work and tea, centred, 1.2 wide
```

### Does a dividing line have a thickness?

No. Where one open space has parts, such as a kitchen open to a living room or a reception area in an open office, the line between them is a dividing line: a virtual wall with no thickness, drawn dashed, so each part is measured and named on its own. Write `open` at the end of the room line to divide it from the room it is placed against, or `wall between dining and kitchen virtual` for any other pair. Rooms that touch with no wall and no `open` are refused (`rooms/touching`), and so are rooms that leave a gap that is neither a wall nor a room (`rooms/gap`). In the plan file a dividing line is a wall with `"virtual": true`; its `thickness` may be 0 and is never used.

```rooms
room living  "Living"  living  5.0 x 4.5 at 0,0
room kitchen "Kitchen" kitchen 3.0 x 4.5 east of living open
door front in living south, 1.0 from west, 0.9 wide, opens in
```

A zone you only want to name inside one room, such as where you sleep in a studio, is a room with `partOf` in the plan file ([Zones inside one room](plan-file.md#zones-inside-one-room)).

### What about an L-shaped room?

It is one room. Write it with `polygon` and the corners of its inside faces in order round it, in metres from the drawing's origin; Grid works out its walls as for any other room.

```rooms
room living "Living room" living polygon 0,0 6,0 6,3 3,3 3,5 0,5
door front in living south, 1.0 from west, 0.9 wide, opens in
```

A room cut out of another's corner, such as a wardrobe in a bedroom, leaves that room L-shaped too: `inside <room> corner <ne|nw|se|sw>` on the cut-out's line. Never split one room into two to draw an L: two rooms are two rooms in every area, schedule and check.

```rooms
room bed  "Bedroom"  bedroom  4.0 x 3.6 at 0,0
room robe "Wardrobe" storage  1.2 x 0.9 inside bed corner ne
door d-bed in bed south, centred, 0.8 wide, opens in
door d-robe in robe south, centred, 0.8 wide, sliding
```

## Writing rooms

One statement per line; `#` starts a comment. A plain number is metres, unless a display line that is not metres says what it is (`display ft-in numbers ft`).

- `room <id> "<name>" <use> <width> x <depth> <where>`: the id is yours and stays the same on every writing; the name is what people read. `<where>` is `at x,y` (the south-west inside corner, for the first room) or `<north|south|east|west> of <room>`, which may add `align <side|centre>`, `shift <m>`, `until <room>` and `open`.
- `*` as a size stretches the room as far as the room named after `until`: `room hall "Hall" corridor 1.3 x * east of living until kitchen`.
- `walls outside 0.3 inside 0.1 height 2.6` sets the thickness of outside and inside walls and their height; Grid decides which walls are outside. Without it, Grid takes its own defaults and says so.
- `door <id> between <room> and <room>, <place>, <w> wide` or `door <id> in <room> <side>, <place>, <w> wide`, and the same for `window` and `opening` (a gap with no door). `<place>` is `centred` or `<m> from <side>`. Then `opens into <room>`, `opens in` or `opens out`, and `hinged <side>` or `hinged left|right`; `sill` and `height` for a window; `sliding`, `double`, `pocket` and the other kinds.
- `floor <id> "<name>" level <n> [height <h>]` starts a floor; every room after it is on that floor. `copy <floor>` starts a floor from another.
- `display ft-in` records that the person reads feet and inches; the file stays in metres.
- `raw wall|room|opening {...}` writes one part the plan file's way ([The raw-wall form](#the-raw-wall-form)).

Rooms are placed in the order written, so a room is named only after its line. Rooms that overlap, touch with no wall, or leave a gap are refused, each with a code such as `rooms/overlap` and the line that would mend it. The whole language is in [rooms-first.md](rooms-first.md), and three realistic plans written this way are in [samples/](samples/): a flat (`flat.rooms`), a two-storey house (`house.rooms`) and an open-plan home (`open-plan.rooms`), each beside the plan file it writes.

## The raw-wall form

Rooms text cannot say everything. A free-standing wall, a curved wall, a room with a hole in it, or a part placed by coordinates you were given is written the plan file's own way, on one line of rooms text after `raw`:

```rooms
room living "Living room" living 5.0 x 4.0 at 0,0
door front in living south, centred, 0.9 wide, opens in
raw wall {"id": "garden-wall", "start": [-0.15, -3.0], "end": [5.15, -3.0], "thickness": 0.2, "height": 1.0, "kind": "exterior"}
```

The plan file itself is JSON: `walls`, `rooms` and `openings`, in metres, with `floors` when there is more than one. Writing it by hand is for exceptions; read it to understand what Grid wrote. Its five conventions, each with a drawing, are in [conventions.md](conventions.md):

- C1, a wall's thickness: its `start` and `end` are its centre line, and it grows half its `thickness` to each side.
- C2, an opening's place: `offset` is from the wall's `start` to the near edge of the opening, along the wall; `offset + width` is at most the wall's length.
- C3, a room's boundary: `boundary` lists the room's walls by id, counter-clockwise seen from above, and its area is measured to their inside faces.
- C4, the coordinates: x to the right (east), y up the drawing (north), in metres.
- C5, floors: every floor shares one origin; a wall or room names its `floor` (unstated, the ground floor), and an opening is on its wall's floor. `level` orders the floors and is never a height.

The smallest plan file by hand: one room 4.0 by 3.0 inside, its walls 0.2 thick on centre lines 4.2 by 3.2 apart, a door opening into the room and a window:

```json
{
  "version": "1",
  "units": "m",
  "walls": [
    { "id": "w-south", "start": [0, 0], "end": [4.2, 0], "thickness": 0.2, "height": 2.6, "kind": "exterior" },
    { "id": "w-east", "start": [4.2, 0], "end": [4.2, 3.2], "thickness": 0.2, "height": 2.6, "kind": "exterior" },
    { "id": "w-north", "start": [4.2, 3.2], "end": [0, 3.2], "thickness": 0.2, "height": 2.6, "kind": "exterior" },
    { "id": "w-west", "start": [0, 3.2], "end": [0, 0], "thickness": 0.2, "height": 2.6, "kind": "exterior" }
  ],
  "rooms": [
    { "id": "living", "name": "Living room", "use": "living", "boundary": ["w-south", "w-east", "w-north", "w-west"] }
  ],
  "openings": [
    { "id": "front", "wall": "w-south", "type": "door", "offset": 1.6, "width": 0.9, "height": 2.1, "hinge": "start", "swing": "left" },
    { "id": "w1", "wall": "w-north", "type": "window", "offset": 1.5, "width": 1.2, "sill": 0.9, "height": 1.2 }
  ]
}
```

A wall's `kind` is `exterior`, `interior`, `partition` or `separating` (a party wall). A door's `hinge` is the end of the opening it turns on (`start` is the end nearer the wall's start) and `swing` the face it opens toward (`left` is the side to your left as you walk from `start` to `end`); a door with neither draws no swing. The JSON Schema says every field a plan may hold ([Where to read more](#where-to-read-more)); [plan-file.md](plan-file.md) says what each means.

## Check, read back and change

- `grid_check` (`grid check`) after every change: what to look at first, then what each check looked at. A clean check only means these checks found nothing.
- `grid_describe` (`grid describe`) says the plan in words; `as=rooms` (`--as rooms`) reads any plan back as rooms text, which writes the same plan again.
- For one change, one call: `grid_change_opening`, `grid_move_room_side`, `grid_merge_rooms`, `grid_split_room`, `grid_add_room`, `grid_stretch`, `grid_rename_room` or `grid_mirror` (`grid edit`). For more, read the plan back as rooms, change the text and write it again.
- `grid_view` (`grid draw`) draws it, in 2D or 3D.

## Retelling what Grid says

Every report carries the label General guidance, not your local rules. When you retell what Grid said, start with its label, "General guidance, not your local rules", and keep it. Never give a verdict on the plan, such as that it is allowed, signed off or up to code: say what the checks found and what they did not check, which is general guidance and not the local rules. Give a figure as the figure used here, with its basis (the document, edition and clause, or where it was looked up) and its status, such as found by an AI and not yet checked by a person.

Room names and ids go into every export (DXF, IFC, OBJ, GLB) and sheet, and travel with the plan file: never put a person's name in a room's name or id. Who sits where belongs in the occupancy file beside the plan (plan.occupancy.json), which no export carries.

## Where to read more

- [conventions.md](conventions.md): the plan file's five conventions, each with a drawing, and the later ones in a table.
- [rooms-first.md](rooms-first.md): the whole rooms language: units, kinds of door and window, many of one room, floors copied.
- [plan-file.md](plan-file.md): every part a plan file may hold, and what each drawing check's code means.
- [samples/](samples/): a flat, a two-storey house and an open-plan home, as rooms text and as the plan file each writes. Every check looks at each of them.
- The plan's structure as a JSON Schema (draft-07): `plan.schema.json` beside the built command (`packages/cli/dist/` and the package), and the resource `grid://schema/plan`. It is made from the code on every build and carries the format version in `$id` and `version`. It allows a field Grid does not know, as Grid does, which reads past it and names it in a note; what JSON Schema cannot say, such as an id naming a part that exists, `grid check` checks.
- [tool-server.md](tool-server.md) and [commands.md](commands.md): every tool and every command.

Every report keeps the label "General guidance, not your local rules".
