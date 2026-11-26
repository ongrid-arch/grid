/**
 * CMD-38: the whole rooms grammar, where agents read it. The compiler's header
 * (`packages/floorplan/src/rooms/compile.ts`) is the language; this is the same language for
 * an agent, by topic, each with one short example Grid writes with no problem
 * (`__tests__/roomsGrammar.test.ts` writes each). One source, three readers: the `rooms`
 * argument of grid_write_rooms, the resource `grid://guide/rooms` and the section "The whole
 * grammar" of `docs/rooms-first.md`, which a test holds to `roomsGrammarMarkdown()`.
 *
 * Its words never say file, folder or path: the `rooms` argument is no path
 * (`everyPath.e2e.test.ts`).
 *
 * Pure: it builds text and touches no file.
 */

/** The tool server's address of the grammar. */
export const ROOMS_GRAMMAR_URI = 'grid://guide/rooms'

/** One topic of the grammar: its name, what its lines say, and one example of them. */
export interface GrammarTopic {
  readonly topic: string
  readonly says: string
  readonly example: readonly string[]
}

export const ROOMS_GRAMMAR: readonly GrammarTopic[] = [
  {
    topic: 'rooms',
    says: 'room <id> "<name>" <use|-> <width> x <depth> [inside|centre|outside] <where>. Width runs east-west, depth north-south. <where>: at x,y (the first room\'s south-west corner) or <north|south|east|west> of <room> [align <side|centre>] [shift <m>] [until [near] <room>]. A size may be * to stretch until a room. walls <t> [kind] after the place sets the thickness between this room and other indoor rooms. Use edge wall to set the exposed sides to this thickness. number "<text>", dept <text> and facts <name>=<value> ... give it its room number, its department and facts of the person\'s own.',
    example: [
      'walls outside 0.3 inside 0.1 height 2.7',
      'room living "Living room" living 5.0 x 4.0 at 0,0',
      'room kitchen "Kitchen" kitchen 3.0 x 4.0 east of living',
      'room hall "Hall" corridor * x 1.2 north of living until kitchen',
      'room office "Office" office 3.0 x 3.0 west of living number "2.03" facts department=Sales capacity=4',
    ],
  },
  {
    topic: 'openings',
    says: 'door|window|opening <id> ["<name>"] between <room> and <room> | in <room> <side>, centred | <m> from <side> [of <room>], <w> wide [, sill <m>, height <m>, opens into <room>|in|out, hinged <direction>, a kind: single, double, sliding, pocket, folding, roller, garage, fixed, high-level]. An opening has no leaf. A side faced by several of a room\'s sides is <side>.<k>, counted from the west, then the south.',
    example: [
      'room living "Living room" living 5.0 x 4.0 at 0,0',
      'room kitchen "Kitchen" kitchen 3.0 x 4.0 east of living',
      'door front in living south, 1.0 from west, 0.9 wide, opens in, hinged east',
      'opening pass between living and kitchen, centred, 1.2 wide',
      'window w1 in kitchen east, centred, 1.4 wide, sill 0.9, height 1.2',
      'window w2 in living south, 0.4 from east, 1.8 wide, sliding',
    ],
  },
  {
    topic: 'floors',
    says: 'floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [copy <floor> [with openings]] starts a floor; every room after it is on it. level is the storey number (0, 1, 0.5), elevation the metres from the ground floor\'s level up to this one, height to its ceiling, slab the floor under it. copy takes another floor\'s rooms (with openings: its doors and windows too), turned, moved or scaled when it says (see turned floors). through <floor> on a room line stands the room and its walls on every floor up to that one, in the same place: a stair, a lift, a shaft. All floors are written in one rooms text, never one plan per floor.',
    example: [
      'floor ground "Ground floor" level 0 elevation 0 height 2.75',
      'room hall "Hall" corridor 2.0 x 4.0 at 0,0',
      'room stair "Stair" stair 1.2 x 4.0 east of hall through second',
      'room flat "Flat" living 3.3 x 4.0 north of hall align west',
      'door front in hall south, centred, 0.9 wide, opens in',
      'opening o-stair between hall and stair, 0.3 from south, 1.0 wide',
      'door d-flat between hall and flat, centred, 0.9 wide, opens into flat',
      'floor first "First floor" level 1 elevation 3.0 height 2.75 copy ground with openings',
      'floor second "Second floor" level 2 elevation 6.0 height 2.75 copy first with openings',
    ],
  },
  {
    topic: 'shapes',
    says: 'room <id> "<name>" <use|-> polygon x,y x,y x,y ... draws a room of any shape from its inside corners, counter-clockwise or not: an L, a room turned at any angle, a corner cut on the slant (a chamfer). Its points are where it is, so no at or of on the line. inside <room> corner <ne|nw|se|sw> [wall <t> [kind]] places a room in a corner of another and cuts it out of it.',
    example: [
      'room hall "Prayer hall" assembly polygon 0,0 12,0 14.5,4.5 4.5,9.3',
      'room lobby "Lobby" corridor polygon 0,-4 12,-4 12,-0.1 0,-0.1',
      'room store "Store" storage 2.0 x 1.5 inside lobby corner sw wall 0.1',
      'door d1 between lobby and hall, centred, 1.8 wide, double',
    ],
  },
  {
    topic: 'curves',
    says: 'A curved wall is written raw, as Grid\'s own JSON: raw wall {"id", "start", "end", "thickness", "kind", "arc": {"centre": [x, y], "sweep": <degrees>}}. The wall turns sweep degrees round the centre from start to end, counter-clockwise positive; its radius is the distance from the centre to start, and end lies on that circle; 360 is a whole circle with start and end one point. It is a true arc, never a polyline. A raw room names curved walls in its boundary as it names straight ones.',
    example: [
      'raw wall {"id": "apse", "start": [4, 0], "end": [-4, 0], "thickness": 0.3, "height": 4, "kind": "exterior", "arc": {"centre": [0, 0], "sweep": 180}}',
      'raw wall {"id": "chord", "start": [-4, 0], "end": [4, 0], "thickness": 0.3, "height": 4, "kind": "exterior"}',
      'raw room {"id": "apse-room", "name": "Apse", "use": "assembly", "boundary": ["apse", "chord"]}',
    ],
  },
  {
    topic: 'raw parts',
    says: 'raw wall|room|opening|stair|bay|ramp {...} writes one part as Grid\'s own JSON, for what rooms lines cannot say: a free-standing wall, a room bounded by walls of its own (boundary: its wall ids in order round it), a room with a hole. A door line may name a raw room (the wall both rooms\' boundaries name, or the one facing <side>). Columns, fixtures and structural grids are lists of the plan of their own, never rooms text; stairs, parking bays, ramps and the site have lines of their own (below).',
    example: [
      'raw wall {"id": "s", "start": [0, 0], "end": [4, 0], "thickness": 0.2, "height": 3, "kind": "exterior"}',
      'raw wall {"id": "e", "start": [4, 0], "end": [4, 3], "thickness": 0.2, "height": 3, "kind": "exterior"}',
      'raw wall {"id": "n", "start": [4, 3], "end": [0, 3], "thickness": 0.2, "height": 3, "kind": "exterior"}',
      'raw wall {"id": "w", "start": [0, 3], "end": [0, 0], "thickness": 0.2, "height": 3, "kind": "exterior"}',
      'raw room {"id": "kiosk", "name": "Kiosk", "use": "retail", "boundary": ["s", "e", "n", "w"]}',
      'door d1 in kiosk south, centred, 0.9 wide, opens in',
    ],
  },
  {
    topic: 'outdoor',
    says: 'outdoor <garden|courtyard|terrace|balcony|light-well|porch|carport|other> [roofed|unroofed] on a room line makes it outdoor space: a garden, a terrace, a balcony off a room, a courtyard. Its outside edges and the sides it shares with other outdoor rooms are open by default. Set the sides facing no room with edge open, edge railing <h> or edge wall [<h>].',
    example: [
      'room living "Living room" living 5.0 x 4.0 at 0,0',
      'room garden "Garden" - 5.0 x 6.0 south of living outdoor garden unroofed',
      'room terrace "Terrace" - 3.0 x 4.0 east of living outdoor terrace roofed edge railing 1.1',
      'door d-garden between living and garden, centred, 1.8 wide, sliding',
      'door d-terrace between living and terrace, centred, 0.9 wide, opens into terrace',
    ],
  },
  {
    topic: 'heights',
    says: 'height <h> on a room line gives that room its own ceiling height; floor <m> sets its floor that far above (or, negative, below) its storey\'s: a lowered entrance, a raised stage. The walls line\'s height is every wall\'s; wall lines (below) give one wall its own.',
    example: [
      'walls outside 0.3 inside 0.1 height 2.6',
      'room genkan "Entrance" corridor 1.5 x 1.8 at 0,0 floor -0.15',
      'room living "Living room" living 4.5 x 3.6 east of genkan height 3.2',
      'room stage "Stage" - 4.5 x 2.4 north of living floor 0.6',
      'door front in genkan south, centred, 0.9 wide, opens out',
      'opening o1 between genkan and living, centred, 0.9 wide',
      'opening proscenium between living and stage, centred, 3.6 wide',
    ],
  },
  {
    topic: 'open sides',
    says: 'open [<room>] after a room\'s place leaves no wall between it and the room it is placed beside (or the room named): one space in two rooms, a kitchen open to a living room, a stage open to its hall. wall between <room> and <room> virtual writes a dividing line with no wall. Use open <north|south|east|west> on a room, unit or unit placement to open that side, including where it faces no room. Use wall <room> <side> virtual to set a single outside edge. An opening line makes a gap of a given width in a wall.',
    example: [
      'room living "Living room" living 5.0 x 4.0 at 0,0',
      'room kitchen "Kitchen" kitchen 3.0 x 4.0 east of living open',
      'room dining "Dining" dining 3.0 x 3.0 north of kitchen',
      'wall between kitchen and dining virtual',
    ],
  },
  {
    topic: 'roofs',
    says: 'raw floor {"roof": {...}, "parapet": <m>} sets the floor\'s own fields rooms lines have no words for, after its floor line: its roof ("shape": flat, mono, gable or hip, "eaves" and "ridge" heights above the floor\'s level, "ridgeRuns": east-west or north-south, "rooflights"), its parapet height, its "outline", "homes" and "parking". On a copied floor, null takes a copied one off.',
    example: [
      'floor ground "Ground floor" level 0',
      'room house "House" living 8.0 x 6.0 at 0,0',
      'raw floor {"roof": {"shape": "gable", "eaves": 2.7, "ridge": 5.2, "ridgeRuns": "east-west"}}',
    ],
  },
  {
    topic: 'repeats',
    says: 'unit <name> [setting=default ...] ... end writes rooms and openings once, $setting in its lines; unit <name> flat "<type>" ["Flat {n}"] makes each placement a flat. place <unit> as <label> <where> [mirror east-west|north-south] [gap <t>] [setting=value ...] places it once; repeat <unit> <n> <east|west|north|south> as <first label> <where> [mirror ...] [first setting=value ...] [last setting=value ...] places it n times in a row. {n} in a name is the label; a label ending in digits counts up (301, 302). <setting>=* fill <length> makes the row that long. Write a row of rooms this way, never line by line or by a script.',
    example: [
      'unit cell w=3.0',
      '  room room "Room {n}" bedroom $w x 4.0',
      '  door door in room north, 0.3 from east, 0.9 wide, opens in',
      '  window win in room south, centred, 1.2 wide',
      'end',
      'repeat cell 4 east as 101 at 0,0',
      'room corridor "Corridor" corridor * x 1.5 north of 101 until 104',
      'repeat cell 4 east as 105 north of corridor mirror north-south',
    ],
  },
  {
    topic: 'turned floors',
    says: 'copy <floor> [with openings] [turn <deg> [clockwise]] [about x,y] [move dx,dy] [scale <s>] copies a floor turned (degrees counter-clockwise, or clockwise with the word), about a point (left out, the middle of its rooms), scaled about it (rooms smaller or larger, walls as thick) and then moved; on its own line or at the end of a floor line. repeat floors <n> from <floor> [as <first id>] [with openings] [turn <deg>] [about x,y] [move dx,dy] [scale <s>] [rise <m>] writes n floors after it, each a copy turned, moved and scaled once more than the one below and rise metres higher: a twisting, stepping or tapering tower in one line, never corner points worked out by hand. The ids count up from the floor\'s digits (f00: f01, f02 ...) or from as. A room written with through stays where it is on every floor. Doors and windows keep their sizes and the sides of their rooms.',
    example: [
      'walls outside 0.3 inside 0.1 height 2.8',
      'floor f00 "Typical floor" level 0 elevation 0 slab 0.2',
      'room east "East flat" living 3.95 x 8 at 0,0',
      'room west "West flat" living 3.95 x 8 east of east',
      'door d1 between east and west, centred, 0.9 wide',
      'window w1 in east south, centred, 1.8 wide',
      'repeat floors 3 from f00 with openings turn 90 rise 3',
      'floor top "Top floor" level 4 elevation 12 slab 0.2 copy f00 with openings turn 90 clockwise about 4,4',
    ],
  },
  {
    topic: 'stairs',
    says: 'stair <id> ["<name>"] from <floor|room> to <floor|room> in <room>, <width> wide, straight|L|U, runs <north|south|east|west> [then <side>] [along <side>] [risers <n>] lays the plan\'s own stair in the room, after the rooms: the drawing\'s treads and break line, the sections, the 3D model, the IFC export and the way-out check read it. A room after from or to stands for its floor, and with no in the stair goes in that room. runs is the way the walking line goes from the from floor; each end keeps a landing as deep as the stair is wide inside the room. L turns on a square landing in the far corner (then: the way it turns, clockwise when left out); U goes up one side and down the other, a short flight across the well, in a room wider than twice the stair; along puts a straight one against that side. ..., <width> wide, run x,y x,y ... gives the walking line itself. Never draw treads as walls. grid_add_stair and grid_change_stair write the same.',
    example: [
      'floor ground "Ground floor"',
      'room hall "Hall" corridor 2.4 x 5 at 0,0',
      'door front in hall south, centred, 0.9 wide, opens in',
      'floor first "First floor" level 1',
      'room landing "Landing" corridor 2.4 x 5 at 0,0',
      'stair st "Main stair" from ground to first in hall, 1 wide, U, runs north',
    ],
  },
  {
    topic: 'items',
    says: 'item <id> ["<label>"] <name> [<w> x <d>] [<h> high] [clear <m>] in <room> against <north|east|south|west> [, at <end> | , <m> from <end> | , full width [<d> deep]] stands a fixture or a piece of furniture with its back on that side\'s inside face, its turn worked out so it faces into the room: centred on the side, in a corner (at west), that far from one end, or as long as the side (a built-in wardrobe). <name> is a library entry (bath, wc, basin, shower-900, kitchen-run-2400, double-bed, wardrobe, sofa-3, desk; grid_measure what=library lists them) or a kind (toilet, basin, shower, bath, kitchen-run, bed, table, chair, sofa, storage, armchair, stool, desk, rug, plant; the equipment rack, generator, pump, tank, seat, pew, altar, fume-cupboard, lab-bench, safety-shower, kennel, exam-table, clinical-sink, and equipment for any other thing, given its size, height and label). clear back|left|right <m> keeps clear floor on that side too. item <id> <name> ... at x,y [turn <degrees>] [on <floor>] places one by its middle. raw item {...} takes Grid\'s own JSON for one. An item against a wall moves with it. grid_add_item, grid_move_item and grid_remove_item write the same.',
    example: [
      'room bath "Bathroom" bathroom 2.4 x 2 at 0,0',
      'room bed "Bedroom" bedroom 3.5 x 4 east of bath',
      'door d1 between bath and bed, centred, 0.8 wide',
      'item tub "Bath 1700" bath 1.7 x 0.7 in bath against north, at west',
      'item wc1 wc in bath against east, 0.1 from south',
      'item robe "Built-in wardrobe" wardrobe in bed against east, full width',
      'item bed1 double-bed in bed against north, at west',
    ],
  },
  {
    topic: 'rows',
    says: 'row <id> <the words of an item line> repeat <n> [every <m>] [, <k> rows [every <m>] [behind]] lays the item out n times side by side along their backs, every metres from middle to middle (their width, so they touch, when left out), and k rows of them, each in front of the last (behind it with behind, for a row at a point), every metres apart (their depth and the clear floor in front when left out). Against a side, the first row is centred on it or set at or from one end. The items are <id>-<n>, or <id>-<row>-<n> in several rows, each a plain item, counted and checked: racks in a data hall, seats in a cinema, pews, kennels. grid_add_item with repeat and rows writes the same.',
    example: [
      'room hall "Data hall" plant 12 x 8 at 0,0',
      'door d1 in hall south, centred, 1.2 wide',
      'row r rack in hall against north, at west, repeat 15, 3 rows every 2.4',
      'row ups "UPS" equipment 1.2 x 0.8 1.9 high at 9.5,0.5 repeat 2 every 1.5',
    ],
  },
  {
    topic: 'parking',
    says: 'After the rooms, the plan\'s own parking bays and ramps, which the drawing, the bay counts, the takeoff and the slope check read; never draw a bay or a ramp as a room. bays <group> in <room> fill, <width> x <length> [aisle <m>] [rows east-west|north-south] [from <side>] [count <n>] [numbered <first>] fills the room with rows of bays and the aisles between them (a row, an aisle, two rows back to back, an aisle; aisles 6 m, Grid\'s own, when left out); bays <group> in <room> along <side>, <width> x <length> [count <n>] [offset <m>] [inset <m>] [from <end>] is one row against that side; bays <group> at x,y, <w> x <l>, count <n>, runs <side> [pitch <m>] [turn <deg>] a row by its first bay\'s middle; bay <id> at x,y, <w> x <l> [turn <deg>] [number <n>] [on <floor>] one bay. car, small, accessible or motorcycle in place of the size is Grid\'s own starting size, not a code\'s. A row\'s bays are <group>-1, <group>-2 and on; numbered B1-01 numbers them on. ramp <id> ["<name>"] from <floor|room> to <floor|room> [in <room>], <width> wide, straight, runs <side> [along <side>] lays a ramp face to face of its room; ..., helix [at x,y] [radius <m>] [turns <n>] [starts <side>] [clockwise] turns it round a circle; ..., run x,y x,y ... gives its middle line; slope <%> is the slope the design means. The answer gives each ramp\'s rise, length and slope. raw bay {...} and raw ramp {...} take Grid\'s own JSON. grid_place_bays and grid_add_ramp write the same.',
    example: [
      'floor b1 "Basement" level -1 height 3',
      'room deck "Deck" parking 30 x 20 at 0,0',
      'room spiral "Ramp" parking 12 x 12 east of deck',
      'opening o-b1 between deck and spiral, centred, 6 wide',
      'floor g "Ground" level 0 height 3',
      'room deck "Deck" parking 30 x 20 at 0,0',
      'room spiral "Ramp" parking 12 x 12 east of deck',
      'opening o-g between deck and spiral, centred, 6 wide',
      'door way-in in deck south, centred, 1 wide, opens out',
      'bays b1 in deck fill, 2.5 x 5, aisle 6, numbered B1-01, on b1',
      'ramp h "Helix" from b1 to g in spiral, 3.5 wide, helix, turns 1',
    ],
  },
  {
    topic: 'site',
    says: 'plot <width> x <depth> [at x,y] (its south-west corner; centred on the building when left out) or site boundary x,y x,y x,y ... writes the plot; street <north|south|east|west|edge n> names the edges on a street, by the side of the drawing they face; setback <all|street|side|edge n> <m> [assumed] the person\'s own set-backs; north <degrees> (counter-clockwise from up the drawing, or <degrees> clockwise) or north <up|left|up-right|...> where the arrow points. site origin x,y, site location <latitude>,<longitude>, site elevation <m> and site country <name> say where it is. ground <m> (or ground <m> below|above) is the ground outside, in metres from the ground floor\'s floor level, the level the sections, the 3D ground and the below-ground check read: ground -0.15 for a floor 15 cm above the ground. site <kind> [<id>] <at x,y | points> [width <m>] [canopy <m>] [height <m>] ["<label>"] is one of the site\'s things, drawn only, its kind one grid_change_site lists: a tree, paving, a pool, a fence, a gate, or a walk, drive or jetty with its width, never a room. grid_set_site and grid_change_site write the same.',
    example: [
      'room house "House" living 8.0 x 9.0 at 0,0',
      'door front in house south, centred, 0.9 wide, opens in',
      'plot 15 x 30 at -3.5,-10',
      'street south',
      'setback street 5',
      'setback all 2',
      'north 30 clockwise',
      'ground -0.15',
      'site tree oak at 9,15 canopy 5 "Old oak"',
      'site pool pool 0,12 3,12 3,18 0,18',
    ],
  },
  {
    topic: 'fit-out',
    says: 'base <base plan> names the plan this one is fitted out in, as the project knows it (base shell.json; in quotes when the name holds a space): the shell, whose walls, doors and windows are read in as existing, drawn, measured and checked with the fit-out, and never written into it. Write the rooms by their inside faces as always: a wall Grid works out whose room faces lie on a base wall\'s faces is the base\'s, and the room names it by the base\'s id. Put a room\'s face on the base wall\'s face (a 0.3 m wall on x = 0 has its faces at -0.15 and 0.15) to rest it there; a face a little off one is said, with how far. A door or window in a base wall is refused, as the shell is read-only: its doors and windows are the base\'s. grid_start_fit_out starts a fit-out with the base\'s rooms as its own.',
    example: [
      'base shell.json',
      'walls outside 0.2 inside 0.1',
      'room front "Reception" office 5.8 x 7.7 at 0.15,0.15',
      'room back "Treatment" office 5.8 x 7.7 east of front',
      'door d1 between front and back, centred, 0.9 wide, opens into back',
    ],
  },
  {
    topic: 'other lines',
    says: 'One statement a line, # starts a comment. A plain number is metres; a length may carry its unit in one word (360cm, 12ft6in). plan "<name>"; building <kind>; display <m|cm|mm|ft-in> [...]; walls outside <t> inside <t> [kind] height <h> (before the rooms of its floor); walltype <t> <kind>; sizes inside|centre|outside; doors height <h>; windows sill <s> height <h>; wall between <room> and <room> [<side>] [<t>] [kind|virtual|railing] [height <h>] [id <id>]; wall <room> <side> [<t>] [kind|virtual|railing] [height <h>]; rename <room> <new id> "<name>" [use]; remove <id>; copy <floor> [with openings] [turn <deg>] [about x,y] [move dx,dy] [scale <s>]; repeat floors <n> from <floor> [...] [rise <m>].',
    example: [
      'plan "Corner shop"',
      'building shop',
      'walls outside 0.3 inside 0.1 height 3.0',
      'doors height 2.2',
      'wall between shop and store 0.2',
      'room shop "Shop" retail 6.0 x 5.0 at 0,0',
      'room store "Store" storage 2.0 x 5.0 east of shop',
      'door front in shop south, centred, 1.2 wide, opens in',
      'door d1 between shop and store, 0.5 from north, 0.9 wide, opens into store',
    ],
  },
]

/** The grammar as one argument description: every topic, its lines and its example. */
export function roomsGrammarText(): string {
  return ROOMS_GRAMMAR.map((t) => `${t.topic.toUpperCase()}: ${t.says} Example:\n${t.example.join('\n')}`).join('\n\n')
}

/** The grammar as markdown, for the resource and `docs/rooms-first.md`. */
export function roomsGrammarMarkdown(): string {
  const topics = ROOMS_GRAMMAR.flatMap((t) => [`### ${t.topic[0]!.toUpperCase()}${t.topic.slice(1)}`, '', t.says, '', '```rooms', ...t.example, '```', ''])
  return [
    '## The whole grammar',
    '',
    'Every line rooms text takes, by topic, each with one example Grid writes with no problem. The tool server serves this section as `grid://guide/rooms` and carries it in the `rooms` argument of `grid_write_rooms`; it is written once, and a test holds the two equal.',
    '',
    ...topics,
  ].join('\n')
}
