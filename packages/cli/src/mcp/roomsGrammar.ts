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
    says: 'room <id> "<name>" <use|-> <width> x <depth> [inside|centre|outside] <where>. Width runs east-west, depth north-south. <where>: at x,y (the first room\'s south-west corner) or <north|south|east|west> of <room> [align <side|centre>] [shift <m>] [until [near] <room>]. A size may be * to stretch until a room. walls <t> [kind] after the place gives that room its own walls.',
    example: [
      'walls outside 0.3 inside 0.1 height 2.7',
      'room living "Living room" living 5.0 x 4.0 at 0,0',
      'room kitchen "Kitchen" kitchen 3.0 x 4.0 east of living',
      'room hall "Hall" corridor * x 1.2 north of living until kitchen',
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
    says: 'floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [copy <floor> [with openings]] starts a floor; every room after it is on it. level is the storey number (0, 1, 0.5), elevation the metres from the ground floor\'s level up to this one, height to its ceiling, slab the floor under it. copy takes another floor\'s rooms (with openings: its doors and windows too). through <floor> on a room line stands the room and its walls on every floor up to that one, in the same place: a stair, a lift, a shaft. All floors are written in one rooms text, never one plan per floor.',
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
    says: 'raw wall|room|opening {...} writes one part as Grid\'s own JSON, for what rooms lines cannot say: a free-standing wall, a room bounded by walls of its own (boundary: its wall ids in order round it), a room with a hole. A door line may name a raw room (the wall both rooms\' boundaries name, or the one facing <side>). Stairs, columns, fixtures, site things, parking bays, ramps and structural grids are lists of the plan of their own, never rooms text.',
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
    says: 'outdoor <garden|courtyard|terrace|balcony|light-well|porch|carport|other> [roofed|unroofed] on a room line makes it outdoor space: a garden, a terrace, a balcony off a room, a courtyard. It is drawn and measured apart from the rooms inside.',
    example: [
      'room living "Living room" living 5.0 x 4.0 at 0,0',
      'room garden "Garden" - 5.0 x 6.0 south of living outdoor garden unroofed',
      'room terrace "Terrace" - 3.0 x 4.0 east of living outdoor terrace roofed',
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
    says: 'open [<room>] after a room\'s place leaves no wall between it and the room it is placed beside (or the room named): one space in two rooms, a kitchen open to a living room, a stage open to its hall. wall between <room> and <room> virtual writes a dividing line with no wall. An opening line makes a gap of a given width in a wall.',
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
    topic: 'other lines',
    says: 'One statement a line, # starts a comment. A plain number is metres; a length may carry its unit in one word (360cm, 12ft6in). plan "<name>"; building <kind>; display <m|cm|mm|ft-in> [...]; walls outside <t> inside <t> [kind] height <h> (before the rooms of its floor); walltype <t> <kind>; sizes inside|centre|outside; doors height <h>; windows sill <s> height <h>; wall between <room> and <room> [<side>] [<t>] [kind|virtual] [height <h>] [id <id>]; wall <room> <side> [<t>] [kind] [height <h>]; rename <room> <new id> "<name>" [use]; remove <id>; copy <floor> [with openings].',
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
    'Every line rooms text takes, by topic, each with one example Grid writes with no problem. The tool server serves this section as `grid://guide/rooms` and carries it in the `rooms` argument of `grid_write_rooms`; it is made from `packages/cli/src/mcp/roomsGrammar.ts`, and a test holds the two equal.',
    '',
    ...topics,
  ].join('\n')
}
