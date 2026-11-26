# The plan file

Read this when you write or change a plan file by hand, or need to know what a drawing check's
code means. Each section says what the plan may state; the list below names the codes each
section explains. Rooms text, the main way to write a plan, is in
[rooms-first.md](rooms-first.md); the figure behind each check is in
[tolerances.md](tolerances.md).

- [What a plan file may hold](#what-a-plan-file-may-hold)
- [What kind of building it is, and what each room is for](#what-kind-of-building-it-is-and-what-each-room-is-for): `plan/not-checked-sizes-for-building`, `plan/not-checked-escapes-for-building`, `floor/not-checked-sizes-for-building`, `floor/not-checked-escapes-for-building`, `plan/unknown-use`
- [Floor levels and heights](#floor-levels-and-heights): `plan/level-gap`, `plan/same-level`, `floor/empty-top`, `wall/above-storey`, `floor/size-question`, `wall/unknown-floor`, `room/unknown-floor`
- [A step inside a floor](#a-step-inside-a-floor): `room/offset-question`
- [Walls through floors, and floors that line up](#walls-through-floors-and-floors-that-line-up): `wall/through-floor`, `room/cross-floor`, `floor/out-of-line`, `floor/set-back`, `floor/split-level`, `floor/gap-under-slab`, `floor/walls-past-floor`, `room/stair-shifted`, `room/lift-shifted`
- [Stairs that join two floors](#stairs-that-join-two-floors): `stair/unknown-floor`, `stair/same-floor`, `stair/no-rise`, `stair/run-too-short`, `stair/too-few-risers`, `stair/duplicate-id`, `stair/end-in-no-room`, `room/stair-out-of-line`, `room/lift-out-of-line`, `floor/no-stair`
- [Slabs, roofs, ceilings and the ground](#slabs-roofs-ceilings-and-the-ground): `opening/below-ground`
- [Sloped roofs and ceilings](#sloped-roofs-and-ceilings): `opening/above-roof`, `floor/rooflight-misplaced`, `floor/dormers-not-drawn`, `floor/dormer-misplaced`, `wall/under-roof`, `opening/missing-wall`
- [A floor outline before the walls](#a-floor-outline-before-the-walls): `floor/past-outline`; massing, storeys, homes and parking spaces
- [Floor no room claims](#floor-no-room-claims): `floor/unclaimed`, `room/space-mismatch`, `room/not-enclosed`, `floor/spaces-unknown`
- [Rooms that overlap, and rooms inside rooms](#rooms-that-overlap-and-rooms-inside-rooms): `room/overlap`, `room/inside-no-host`, `room/overlap-unknown`, `floor/overlaps-unknown`
- [Zones inside one room](#zones-inside-one-room): `room/zone-not-in-room`
- [Flats and flat types](#flats-and-flat-types): `flat/unknown-room`, `flat/room-in-two`, `flat/unknown-type`, `flat/duplicate-id`, `flat/duplicate-type`, `flat/zone-without-room`
- [A way out that leads somewhere, and rooms to let](#a-way-out-that-leads-somewhere-and-rooms-to-let): `opening/into-closed-court`, `room/through-another-let`, `opening/door-out-above-ground`, `opening/between-levels`
- [Rooms with holes](#rooms-with-holes): `room/hole-outside`, `room/holes-overlap`, `room/unclosed`, `room/out-of-order`, `room/inside-out`
- [A curved wall](#a-curved-wall): `wall/arc-ends-apart`, `wall/arc-too-tight`
- [Opening patterns](#opening-patterns): `pattern/unknown-wall`, `pattern/does-not-fit`, `pattern/unknown-floor`, `pattern/no-wall-above`, `pattern/overlaps-opening`, `pattern/id-clash`
- [Fixtures](#fixtures): `item/unknown-kind`, `item/too-large`, `item/no-size`, `item/duplicate-id`, `item/unknown-floor`, `item/outside-rooms`, `item/into-wall`, `item/too-tall`, `item/blocks-doorway`, `item/blocks-window`, `opening/door-hits-item`
- [Columns and a structural grid](#columns-and-a-structural-grid): `plan/column-too-large`, `plan/column-duplicate-id`, `plan/column-unknown-floor`, `plan/column-through-floor`, `plan/grid-unknown-floor`
- [Parking bays and ramps](#parking-bays-and-ramps): `plan/bay-too-large`, `plan/bay-duplicate-id`, `plan/bay-unknown-floor`, `plan/bay-number-repeated`, `plan/bays-overlap`, `plan/ramp-too-large`, `plan/ramp-duplicate-id`, `plan/ramp-unknown-floor`, `plan/ramp-same-floor`, `plan/ramp-no-rise`, `plan/ramp-no-run`, `plan/ramp-slope-differs`
- [Writing on the drawing, and the sketch layer](#writing-on-the-drawing-and-the-sketch-layer): `floor/sketch-drawn-only`, `plan/note-no-place`
- [Facts of your own, and room numbers](#facts-of-your-own-and-room-numbers): what a part may carry, and where it goes
- [Kinds of door and window, their handing and the part that opens](#kinds-of-door-and-window-their-handing-and-the-part-that-opens): `opening/wide-single-leaf`, `opening/kind-not-for-type`, `opening/part-too-large`, `floor/not-checked-door-swings`
- [Named wall, door and window types, and finishes](#named-wall-door-and-window-types-and-finishes): `type/unknown`, `type/duplicate-id`, `type/wrong-part`; materials, and the template an office keeps
- [Existing, demolished and new](#existing-demolished-and-new): `plan/read-after-work`, `opening/phase-wall`, `room/phase-wall`; a fit-out on a base plan
- [Wall faults, each with its fix](#wall-faults-each-with-its-fix): `wall/short`, `wall/gap`, `wall/overrun`, `wall/duplicate`, `wall/line-on-wall`, `room/wall-listed-twice`, `wall/crosses-room`, `wall/stands-in-room`
- [Inside and outside walls](#inside-and-outside-walls): `wall/kind-differs`
- [A wall placed by its face](#a-wall-placed-by-its-face): a survey drawn from its own numbers, the thickness known or not
- [Lengths taped on site](#lengths-taped-on-site): `room/taped-differs`, `plan/taped-not-measured`
- [A trace image under the plan](#a-trace-image-under-the-plan): a scan, photo or sketch placed, scaled and drawn under a floor
- [North, front and where the building is](#north-front-and-where-the-building-is): `plan/front-not-said`, `plan/y-down`
- [Survey coordinates at a stored origin](#survey-coordinates-at-a-stored-origin): `plan/far-from-origin`
- [Where a value came from](#where-a-value-came-from): `plan/value-assumed`, `plan/mark-no-part`; a value left out stays not stated
- [Saved views, and the camera record](#saved-views-and-the-camera-record): a camera saved by name, as Grid sets it and as BCF writes it
- [What needs to be accessible](#what-needs-to-be-accessible): `plan/not-checked-access`
- [People are kept out of the plan](#people-are-kept-out-of-the-plan): who sits where, in a file of its own
- [How the format changes](#how-the-format-changes): what a new field may and may not do

## What a plan file may hold

Every field each part may hold is in the plan's JSON Schema, which the build writes beside the
command as `plan.schema.json` and the tool server serves as `grid://schema/plan` (CMD-7). It is
made from the schema Grid reads plans with, so it validates every plan Grid reads; it allows a
field Grid does not know, which Grid reads past and names (`plan/unknown-field`). Its five
conventions, each with a drawing, are in [conventions.md](conventions.md).

The command and the tool server read a plan file one way (`packages/cli/src/fs/textEncoding.ts`
and `packages/cli/src/command/planText.ts`). The file may be UTF-8, with or without a byte-order
mark, or UTF-16; anything else is refused with the first byte that is not UTF-8, so a Latin-1
file never reaches the exports with its letters turned into question marks. A file larger than
64 MB is refused before it is read. Then, before the schema:

| Text | At most | Also refused |
|---|---|---|
| a room, floor or stair name, a fixture's label, the plan's name or title, a note's or a sketch's text, a lowered zone's name, a saved view's name, a flat's or a flat type's name, a building's or a context shape's name, a column's label, a structural grid's name or a grid line's name, a ramp's name | 120 characters | line breaks of any kind, control characters, characters that change the direction text is shown in, characters that show nothing (a zero-width space, a word joiner, a soft hyphen, a byte-order mark inside the text, a Hangul filler, a tag character; the zero-width joiner and non-joiner stay, since scripts and emoji need them), and half of a character pair |
| an id: of a wall, room, opening, floor, stair, rooflight or opening pattern, a wall a room, an opening or a pattern names, a part's floor, the floors a stair joins or a pattern repeats on, the room a zone is part of, a flat's id, type and rooms, a flat type's id, a building's id and floors, a context shape's id and floor, a column's id, floor and `through`, a structural grid's id and floors, a parking bay's id, number and floor, a ramp's id and the floors it joins | 64 characters | the same |
| the trace image's path, the base plan's path | 1,024 characters | the same |
| the place, `site.country` | 120 characters, and then a name or a code on Grid's list ([the place](#the-place)) | the same |
| a fact's name, or its value when it is text (CNT-9); a room's number | 120 characters; a number 64 | the same |
| a named type's id, and the type a wall, door, window or default names (CNT-15); a type's name, its material, a room's finish | 64 characters; 120 | the same |
| the wall types, door types or window types | 50,000 of each | |
| the facts one wall, opening, room or floor carries | 100 | |
| a thing on the site: its id; its label | 64 characters; 120 | the same |
| walls, rooms, openings, floors, items, stairs, opening patterns, annotations, sketch items, saved views, things on the site, taped lengths, flats, flat types, buildings, context shapes, columns, structural grids, parking bays or ramps | 50,000 of each | |
| the floors one building lists | 50,000, and at least one | |
| the rooms one flat lists | 50,000, and at least one | |
| the floors one opening pattern repeats on | 200 | |
| the points of the site's boundary, of one of its things, of a floor's outline or of a context shape | 2,000 | |
| the points of one sketch line or shape, or of one lowered zone of a ceiling | 2,000 | |
| the lowered zones of one ceiling, the rooflights of one roof | 50,000 | |
| the walls a room lists | 2,000 | |

A refusal names the part and the limit (`rooms[0].name holds a line break (U+000A); it must be
one line`) and never repeats the text. Writing on the drawing and the facts of your own are not
refused (MSG-20): a note's or a sketch item's text, a fact's name or value, or the trace image's
path that breaks a rule here leaves out that note, sketch item, fact or trace image alone, with
one `plan/value-left-out` line at its place, and the rest of the plan is read. Markup in a name is allowed: it is drawn as text. The
ids in `grid check`'s drawing problems are quoted, and `grid_check` returns the rooms a finding
is about, by id and name, apart from its message.

## A fault stays where it is

A value Grid cannot read inside one part no longer refuses the whole plan (MSG-6). The plan is
read part by part with the format's own rules (`packages/floorplan/src/types/readParts.ts`), and
`grid check` gives one line for each part or value it could not read as written, by the part's
id (or its place, when it has no id that can be read) and its place in the file:

| What the file holds | What Grid does | Line |
|---|---|---|
| a number written as text (`"2.5"`, `"0.9 m"`), `"true"`, a word in other capitals (`"Exterior"`, `"Door"`, units `"M"`) | reads it as meant | `plan/read-as-meant` |
| a value a field can do without that cannot be read (a hinge `"left"`, a `null` thickness, units `"furlong"`) | uses the field's default, or reads it as not stated; a unit Grid has no word for is read as metres | `plan/value-left-out` |
| a room with no `name`, or one that is not text (`null`, a list) | reads the room with its id as its name, so it is drawn and measured by its id; a blank name (`""`) is read as written, and the drawing and the answers call that room by its id too (WRT-43) | `plan/value-left-out` |
| units `"mm"`, `"cm"`, `"ft"` or `"in"` | reads every length in that unit, and writes the plan back in metres when it changes it (see [Units](#units)) | `plan/read-as-meant` |
| a value the part needs that cannot be read (a negative offset, a missing start, an opening type `"gate"`) | leaves the part out, and the rooms and openings on a wall left out with it | `plan/part-left-out` |
| a wall's thickness or height, or an opening's sill, stated out of range or as a word; a wall's `face` that is not `left` or `right` | leaves the part out: a default would change what is drawn and measured | `plan/part-left-out` |
| `NaN`, `Infinity`, or a number with a decimal comma in an object (`"offset": 3,45`) | reads it as a value that is not there, and names it for what it is | as above |
| an entry of one of the plan's other lists that cannot be read (a sketch line with `from` and `to` where a line takes `points`, a note with too long a text, a stair) | leaves that entry out, each with its own line, and keeps the rest of the list (MSG-20) | `plan/value-left-out` |
| git's conflict markers | refuses the plan as an unfinished merge, with the line and what each side adds | `plan/unfinished-merge` |

Ids are unique across the whole plan. Of two parts that share an id, only the clash is left out
(`plan/id-clash`): the wall keeps its id, since rooms and openings name walls, so the rooms on it
are still measured. Two walls with one id are both left out (`plan/duplicate-id`), with an id to
rename one to. A blank id, and an id that differs from an earlier one only in capitals or spaces,
leave the part out (`plan/blank-id`, `plan/similar-id`). What is wrong at the plan's top level (a
version Grid does not read, `walls` that is not a list) still refuses the plan.

`grid check`, `draw`, `export`, `describe` and the reading tools read a plan this way. `grid tidy`,
`grid write` and the tools that change the plan write it back, so they read it whole and refuse a
plan with anything left out, naming the first. The record's codes are in
[the result contract](result-contract.md).

## What kind of building it is, and what each room is for

A plan may say what kind of building it is with `building`, and a floor may say otherwise for
itself with its own `building`: the shop on the ground floor of a block of flats (CNT-5). Both
are optional; unstated, a floor is the plan's kind, and a plan that says nothing is read and
checked as before.

```json
{ "version": "1", "building": "home", "floors": [{ "id": "ground", "name": "Ground floor", "level": 0, "building": "shop" }, …] }
```

| `building` | What it is |
|---|---|
| `home` | a house or a flat people live in |
| `office` | an office |
| `shop` | a shop |
| `food` | a café, restaurant or bar |
| `hotel` | a hotel or hostel |
| `school` | a school |
| `health` | a health building, such as a clinic |
| `sport` | a sports building |
| `assembly` | a building people gather in, such as a hall |
| `industry` | a workshop or factory |
| `warehouse` | a warehouse |
| `parking` | a car park |
| `other` | another kind of building |

A check that applies a figure runs only in the kinds of building its figures were read for, or
where the plan does not say. Every figure Grid carries today was read for homes, so the room-size
and escape checks run on a floor that is a `home` or says nothing, and on no other: their rooms
are skipped (`not_for_building`), and one line says so. It is about the whole plan when the
plan's own kind is the reason on every floor (`plan/not-checked-sizes-for-building`,
`plan/not-checked-escapes-for-building`), and about the floor otherwise
(`floor/not-checked-sizes-for-building`, `floor/not-checked-escapes-for-building`). Each check in
the record's `coverage` says the uses it looks at and the kinds of building it runs in. A floor
the plan says is a home gets the figure checks, and their notes say the plan says it is a home.

A room says what it is for with `use`, one of 27:

| Group | Uses |
|---|---|
| A home | `bedroom`, `living`, `dining`, `kitchen`, `bathroom`, `toilet`, `utility`, `study` |
| Work, trade, learning, care, sport | `office`, `meeting`, `reception`, `retail`, `classroom`, `treatment`, `waiting`, `sport`, `changing`, `staff`, `worship`, `assembly` |
| Moving about | `corridor`, `stair`, `lift` |
| Services | `storage`, `plant`, `parking` |
| Anything else | `other` |

The person's own word for a room is its `name`: "Pooja room", "Bryggers", "Open office (12
desks)". A use is read whatever its capitals, and a word that plainly means a use is read as it
(`USE_WORDS` in `packages/floorplan/src/types/floorplan.ts`): `WC` is `toilet`, `staff room` is
`staff`, `warehouse` is `storage`, `bryggers` is `utility`, `pooja room` is `worship`. No English
word is read as `bedroom`, `living` or `dining`, the uses the figure checks look at, so a room comes
under them only by its author's choice (a use's own name in another language, `dormitorio`,
`Schlafzimmer`, `卧室`, is that choice made in the author's words, see [Units](#units)): `lounge` and `living room` give a `plan/unknown-use`
line that suggests `living`. A word that means two things (`hall`, `studio`) is not read either.
Any other word is read as no use stated, with a line that names it.

A room may also say:

| Field | What it states |
|---|---|
| `tenure` | Who it is for: `private` (one household's or one tenant's own), `shared` (some households' or tenants', not all), `common` (the building's, for everyone in it, such as the stair or the bin store) or `commercial` (let or run as a business) |
| `roomType` | The firm's own type for the room, as its room data sheets name it ("B2 double bedroom"), beside the fixed use. At most 120 characters, one line. Grid keeps it and reads nothing from it |
| `conditioned` | `true` when the room is heated or cooled, `false` when it is not: whether it is in the living area under air ([areas.md](areas.md#living-area-under-air-and-total-under-roof)). Unstated, a room is conditioned unless its use is `parking`. Read as nothing on outdoor space, a void or a zone, which follows its room. Rooms text writes `conditioned` or `unconditioned` on a room line |

One check reads `tenure`: a room to let is left through the common parts ([a way out that leads
somewhere](#a-way-out-that-leads-somewhere-and-rooms-to-let)). No check reads `roomType`. Rooms text writes all of these: `building office`,
`floor ground "Ground floor" building shop`, and `tenure common` and `type "B2"` on a room line
([rooms-first.md](rooms-first.md)).

## Units

The plan file stores metres, always (WRT-7). The person's own units are read and written at
the edge, chosen per person:

- **Reading.** Every length a tool or `grid edit` takes is a number in metres, or text with its
  unit: `3.81`, `3.81 m`, `381 cm`, `3810 mm`, `12'6"`, `12' 6"`, `12'-6"`, `12 ft 6 in`, `150"`,
  `6 1/2"`. With the call's `decimal` set to `comma` (`--decimal comma`), `3,81` is 3.81 m; without
  it, `3,81` is refused with one line that names the decimal comma. A length past Grid's largest,
  or text Grid cannot read, is refused in words, by the argument's name. A plan file that states
  `"units": "mm"` (or `cm`, `ft`, `in`) is read in that unit and written back in metres.
- **Rooms text.** A plain number is metres, unless the display line is not metres and says what
  a plain number is with `numbers` (`display ft-in numbers ft`); a length may carry its unit in
  one word, with no space: `360cm`, `12ft`, `12ft6in`, `12'6"` ([rooms first](rooms-first.md)).
- **Writing.** A plan may say how its person reads lengths, in `display`. It changes no stored
  number. Rooms text sets it with a `display` line (`display ft-in precision 3`), and the
  read-back writes that line again:

  ```json
  "display": { "length": "ft-in", "area": "ft2", "decimal": "point", "precision": 0 }
  ```

  | Field | Takes | Left out |
  |---|---|---|
  | `length` | `m`, `cm`, `mm` or `ft-in` | `m` |
  | `area` | `m2` or `ft2` | `ft2` with `ft-in`, else `m2` |
  | `decimal` | `point` (2.40) or `comma` (2,40) | the language's: `comma` for `es`, else `point` |
  | `language` | any language, as a BCP-47 tag (`en`, `es`, `de`, `pt-BR`): the language Grid writes its own words in (MSG-11, MSG-24, [Languages](languages.md)) | `en` |
  | `words` | the plan's own words for Grid's keys, per language (C32, [below](#grids-words-in-another-language)) | none |
  | `precision` | decimals shown, 0 to 5; in feet and inches, the inch in 2^n parts (0 whole inches, 3 eighths) | 2 for m, 1 for cm, 0 for mm and ft-in |

  A call's `units` and `decimal` (`--units`, `--decimal` on `grid draw`) win over the plan's
  `display`. In feet and inches a length is written `12'-6"` and a sill `48"`; in millimetres,
  `2860`. The drawing's room areas and dimensions, and the figures of `grid_areas`,
  `grid_takeoff`, `grid_schedule`, `grid_measure` and `grid_view`, and the sheet's figures,
  tables and drawings, follow the display. The check's report and the edit answers are still in
  metres; the check's report and the sheet follow its language and decimal mark (MSG-11). The
  exports stay in metres and say so in the file, as DXF, IFC and glTF expect. A room's `use` may
  be written by its label in a language Grid writes (`dormitorio` is `bedroom`), or by a word for
  it in Spanish, German, French or Chinese (MSG-22, `USE_WORDS_BY_LANGUAGE` in
  `packages/floorplan/src/messages/uses.ts`: `cocineta`, `Flur`, `chambre`, `卧室`); its `name` is
  never translated. A `language` with a region (`es-MX`, `es-ES`) is read as its language. A plan
  with no `floors` stands on one floor Grid names in its language: "Ground floor", "Planta baja".

## Grid's words in another language

Grid ships its words in English and Spanish. For any other language the plan keeps its own words
(MSG-24, C32), which the agent writes with `grid_words`; nobody writes a translation file:

```json
"display": {
  "language": "de",
  "decimal": "comma",
  "words": { "de": { "label": "Allgemeine Hinweise, nicht Ihre örtlichen Vorschriften", "join.and": " und " } }
}
```

- `words` maps a language, as its primary subtag in lower case (`de`, `pt`, `zh`, never `en`), to
  a map from a key of Grid's messages to its wording, with exactly the English key's placeholders
  (`{size}`), on one line.
- Grid writes a key in a language from the plan's word, else from the file it ships for the
  language, else in English. A word the reader cannot take (a key Grid does not have, a placeholder
  that differs from the English key's, a line break) is left out alone, with a reading line at its
  place (`display.words.de.<key>`), and the English is said.
- The decimal mark is the display's `decimal` (a point for a language Grid ships no file for),
  never the words'. Room names and floor names are the person's own and never words.

## Floor levels and heights

A floor in the plan's `floors` list has a `level`, which only orders the floors (0 the ground
floor, 1 the one above, -1 a basement, 0.5 a half level between). Where a floor stands and how
high it is may be stated apart from that order, in metres. All three are optional:

| Field | What it states |
|---|---|
| `elevation` | Where the top of the floor's slab stands, above the ground floor's floor level (0) |
| `height` | The floor's clear height. A solid wall on it that states no height of its own takes it |
| `slab` | The thickness of the slab the floor stands on (0.25 m when not stated) |

A floor that states nothing stands where it always did: its height is its tallest wall, and it
stands on the floor below it, one slab higher. Each part of a floor with nothing above it is
roofed on that floor's own walls ([Slabs, roofs, ceilings and the ground](#slabs-roofs-ceilings-and-the-ground));
the building's box, which the 3D view frames, still ends on the highest storey top, whichever floor
that is on, so a loft stated inside a taller storey does not shrink it. The 3D view, the IFC export
and the sheet all read the floors' heights from this one rule.

The drawing's checks ask about levels that do not add up, as warnings: a missing level
(`plan/level-gap`, a flat on level 3 drawn alone stands on the ground until it states its
elevation), two floors at one level one over the other (`plan/same-level`), an empty top floor
that still counts as a storey (`floor/empty-top`), a wall taller than the height its floor states
(`wall/above-storey`) and a floor height far outside a storey's (`floor/size-question`): higher
than a wall is asked about, or lower than a storey a person stands in (`storeyLowest`, 2 m, Grid's
own size). A floor with another floor over it that states no height is asked about when its
tallest wall, which then sets its storey, is lower than that (the top floor is not: its low walls
may be a loft's); a floor under a roof of its own is
asked about only below `wallLowest`, since a loft's eaves may be that low (LVL-18). A wall
or room on a floor id the plan does not know is an error and is left out, with the nearest id the
plan has (`wall/unknown-floor`, `room/unknown-floor`); with no floor list, only an id spelt like
one more of the plan uses counts as unknown. A door to the outside on a floor more than 2 m above
the ground is named by the plan checks and is never a way out.

## A step inside a floor

A room's floor may stand a little above or below its storey's: a genkan a step down from the
hall, a sunken wet area, a raised stage. The room says so with `floorOffset`, in metres from its
storey's floor level, positive up and negative down. Unstated, the room stands on the storey's
floor.

```json
{ "id": "genkan", "name": "Genkan", "boundary": ["s", "x", "n", "w"], "floorOffset": -0.18 }
```

A platform that covers part of a room, such as a stage, a raised stand floor or a loading dock,
is a room inside that room (`"inside": true`), edged with dividing lines and with its own
`floorOffset`. It is floor, not a wall: its area is counted at its own level and taken off the
room around it.

Where two rooms at different levels meet, the 2D drawing shows the step as a solid line: across
each door or doorless opening between them, on the lower room's face of the wall, and over a
dividing line between them. A window gets none. In 3D, in the OBJ and glTF files and in the IFC
file, the room's floor and space stand at its own level, and a raised room is solid down to the
storey's floor. A room set more than 1.5 m off its storey, or raised to the height its floor
states, is asked about (`room/offset-question`): so far off, it is more likely a floor of its own.

## Walls through floors, and floors that line up

A wall stands on one floor. It may also rise through the floors above it: `through` names the
highest floor it rises through, and it stands on its own floor and on every floor between, in the
order of `level`. It is one wall, shared by those floors: a room on any of them may list it, and
one edit moves it on all of them. Its `height` is how high it stands above the `through` floor's
level, as a wall of that floor would (left out, it takes that floor's `height`); below that it runs
up through every floor and slab between. A stair hall's wall, a double-height shopfront and a wall
rising past a mezzanine are written this way.

```json
{ "id": "g-n", "start": [8, 6], "end": [0, 6], "thickness": 0.3, "kind": "exterior", "height": 2.7, "floor": "ground", "through": "first" }
```

An opening in such a wall states its sill and height from the wall's own floor, as every opening
does, and may reach as high as the wall rises. The lab's stair window from 0.9 to 5.4 m is one
window: `"sill": 0.9, "height": 4.5` in the wall above, which rises 5.65 m (the ground floor's
2.70 m, its 0.25 m slab and the first floor's 2.70 m). A window that lies on the first floor only
states its sill from the ground floor too (3.85 m for a sill 0.90 m above the first floor). Two
openings one over the other in such a wall are not an overlap.

Each floor's plan draws the stretch of the wall that stands on it and the part of each opening that
lies there, as a wall of that floor: the stair window is drawn as a window on both floors. The 3D
view, the OBJ and glTF files and the IFC file raise the wall once, from its own floor to its top,
with each opening whole, so the IFC holds one wall and one window on the ground floor's storey. A
section cuts it once, whole, and the slab between the floors stops at its openings. The storeys
stand where they would with a wall of each floor: the wall counts toward the height of the floor it
rises through. A `through` that names a floor the plan does not have, or one not above the wall's
own, is said (`wall/through-floor`, a warning), and the wall stands on its own floor only. A room
that lists a wall of another floor that does not rise through its own is still an error and is left
out (`room/cross-floor`).

Floors are drawn one over the other, each with its own walls, so widening one floor leaves the one
above where it was (lab E-9). The drawing's checks set each floor's outline, as its walls draw it,
against the floors below it: where it reaches past them, or sits back from them, by more
than 0.05 m (`stackShift`) and half the thickest wall that stretch runs along (walls of different
thickness on one axis have their faces that far apart), it says so, with the side, by how much and the box
of each stretch (`floor/out-of-line`, a warning). A floor that lies wholly inside the floors
below, such as a mezzanine, a part upper floor or the floor over a single-storey extension, is a
part floor instead: it is said once, with each side it sits back on and how far, the sides it
lines up with and where it and the floor below stand (`floor/set-back`, a warning, LVL-10).

The floors below a floor are those of its own building (each building in `buildings`, and the
floors no building names together) that stand lower, by their floor levels when a floor states its
`elevation` (else by `level`), and that lie under its outline by more than a wall they share:
the two halves of a split level overlap by the wall between them, and neither is under the other.
A floor covered by a nearer one is left out, so a floor over a ground floor over a basement is set
against the ground floor (LVL-11). A floor with nothing under it that stands a half level up beside
a lower floor of its building, less than that floor's clear height above it, is a split level: the
plan's split levels are said once, each half level with how far up it stands and on which side of
the floor it steps from (`floor/split-level`, a warning), never as a floor that reaches past the
floor below. A floor with nothing under it that is no half level, such as one drawn a storey up
beside the floor below by mistake, is set against the floors of its building at the nearest level
below it, and said to be out of line.

Under another floor a storey's top is that floor's slab (VEW-33). Each floor under another, as the
pairs above find them, has its tallest drawn wall set against the underside of the upper floor's
slab (its `slab`, else 0.25 m), by the floors' levels: walls that stop short of it by more than
0.005 m (`sameFloorLevel`) leave a gap (`floor/gap-under-slab`, a warning), and walls that rise
past the upper floor's level stand in the storey above it (`floor/walls-past-floor`, a warning).
Walls that run into the slab and stop in it are not said, since writing each storey's walls floor
to floor, slab included, is a common way to state heights. A floor marked `"overhang": "meant"` is
still set against them: that mark is about outlines. Sections and facades draw no gap: a wall at
its storey's full height (its floor's tallest, or one whose height nothing states) that stops
short of the slab of a floor over it, or of the flat roof Grid lays over it, is drawn up to it,
and the section lists the walls it raised and marks the strip it added. A lower wall, such as a
dwarf wall or a parapet, keeps its own top.

A room used as a stair, or a lift shaft, that
lies over the one below enough to join it but is moved from it by more than 0.05 m is said too,
with which way, how far and where both stand (`room/stair-shifted`, `room/lift-shifted`). A lift
shaft is the same on every floor, so one whose sides stand off the one below's is said even when it
is not moved as a whole. An overhang, a set-back or a moved stair is often meant: a floor or a
room that states `"overhang": "meant"` is not asked about.

```json
{ "id": "first", "name": "First floor", "level": 1, "overhang": "meant" }
```

`through` and `overhang` are optional and never defaulted (version 1). Rooms text writes rooms
that rise through floors (`through <floor>` on a room line) as a room and its walls on each floor,
stacked, not as walls through floors.

## Stairs that join two floors

A stair is stated once, in the plan's `stairs` list, across the two floors it joins. The plan
says what is meant and Grid works out the rest. Rooms text writes it in a line of its own,
`stair s1 from ground to first in hall, 0.9 wide, straight, runs north`, and the tools
`grid_add_stair` and `grid_change_stair` write the same (LVL-21,
[rooms-first.md](rooms-first.md#the-whole-grammar)); in the file it is:

```json
{ "id": "s1", "name": "Main stair", "from": "ground", "to": "first", "width": 0.9, "run": [[0.6, 0.6], [0.6, 3.4]] }
```

| Field | What it states |
|---|---|
| `from`, `to` | The floor the walking line starts on and the floor it ends on. Either may be the higher |
| `width` | The width of the flight, in metres |
| `run` | The walking line, down the middle of the flight: from the stair's edge on `from` to its edge on `to`. Each point between is a turn, with a square landing as wide as the flight. A straight stair may give its two ends as `start` and `end` instead |
| `risers` | Optional: how many risers, when the design has chosen. Unstated, Grid takes the number that brings twice the riser plus the going nearest 0.63 m |
| `name` | Optional |

From the two floors' levels (and the floor offset of the rooms the stair starts and ends in),
Grid works out the rise, the number of risers and their height, the going and the pitch, and
which room the stair leaves from and arrives in (`planStairs`). For the stair above: a 2.95 m
rise in 14 risers of 0.211 m, treads of 0.215 m. `grid describe` says them. The 2D drawing
shows the stair on both floors, with a line at every riser and its walking line ending in an
arrow pointing up. On the floor it rises from, the plan is cut 1.2 m above the floor
(`planCutHeight`): the stair is solid up to where its flight reaches that height, a break line
crosses it there, and the rest is dashed; on the floor it arrives on it is drawn whole (SHT-11).
3D, the OBJ and glTF files and the IFC file (an `IfcStair` of `IfcStairFlight`s and landing
slabs) draw a block per tread. The stair adds no floor of its own: its area is counted once, in
the rooms it stands in. Rooms used as a stair on floor after floor, one over the other, are
counted once too, on the floor the stair rises from ([areas.md](areas.md)). Nothing here judges a
riser, a going or a width.

The way-out check follows routes up and down the stair, so an upper floor or a basement is
checked through it down to a door. Rooms used as a stair on neighbouring floors that lie one over
the other (sharing at least half of the smaller one) are taken as a stair too, as agents already
draw them; where both floors have stair rooms and none lies over another, they are named as out
of line (`stair_out_of_line`), and so are lift shafts (rooms used as a `lift`,
`lift_out_of_line`). A lift shaft is drawn with a cross in it, corner to corner, on every floor
(SHT-11). A lift is never taken as a way out. A floor no stair joins to the ground floor
is said not to be checked. A floor above the ground with nothing on it to reach it by (no room
used as a stair or a lift, and no stair or ramp stated from or to it) is a finding,
`floor/no-stair`, when the plan draws a ground floor; its fix is the rooms-text line that adds a
stair room on the ground floor rising `through` it, and `grid write` says it as soon as the plan
is written. A stair that cannot be laid out is said and left out
(`stair/unknown-floor`, `stair/same-floor`, `stair/no-rise`, `stair/run-too-short`,
`stair/too-few-risers`, `stair/duplicate-id`), and one whose end stands in no room joins nothing
(`stair/end-in-no-room`, a warning).

## Slabs, roofs, ceilings and the ground

The plan states no slab and no roof: Grid works them out from each floor's outline, the floor its
walls enclose, walls and all, the same shape as its gross external area (`planEnvelope`). An
outline only exists where walls meet and close a floor; a floor whose walls close none has no slab
and no roof, and a garden wall standing apart carries neither.

- **One slab per floor**, the one it stands on: its top at the floor's level, as thick as the
  floor's `slab` (0.25 m when it states none). It is open over each stair and lift shaft that rises
  into it from the floor below: a stated stair opens it over its flights and landings; rooms used
  as a stair that lie one over the other, with no stated stair between them, open it over the floor
  they share, the whole stair room, because the plan does not say where the flights are; a lift
  shaft is open over the floor its rooms share. A room set below its storey (LVL-7) is cut out of it
  and has its own piece, lower down. The lowest level's slabs are base slabs. The floor inside a
  hole in a room that no room fills, a courtyard, is open: no slab and no roof.
- **A roof over every part with nothing above**: the floor's outline less the outlines of every
  floor whose floor stands higher, at any height, flat, on the floor's walls, 0.25 m thick, with no
  overhang. So a single-storey wing is roofed where the floor above does not reach. What stands
  above is read from the floors' elevations, not the order of `level`: the half-levels of a
  split-level house or car park are floors, with a roof over the top one of each part only
  (LVL-15). A floor that shares its `level` with another but stands at its own elevation, a step
  of a stepped house, is roofed on its own tallest wall unless it states its `height`. A roof that would lie at or
  under the ground (`site.ground`, else 0) is not laid: the ground covers a crypt or a basement
  where the floor above does not. On a floor with open outdoor space, the walls that bound it and
  no room (a terrace's parapet, a balcony's edge) have no roof over them, even where the same wall
  runs on past a room, such as a stair house on a roof terrace (LVL-13).
- **A void**: a room marked `"void": true` is open to the floor below. It has no floor, so its
  floor's slab is open over it, and it adds no floor area to the slab; it needs no door and has no
  route to check.
- **A parapet**: a floor's `parapet` is how far its outside walls rise above the roof over it. The
  roof keeps its place on the walls, and the parapet stands on its edge.

```json
{ "floors": [{ "id": "ground", "name": "Ground floor", "level": 0, "parapet": 1.1 }],
  "site": { "ground": -0.15 },
  "rooms": [{ "id": "k", "name": "Kitchen", "boundary": ["s", "e", "n", "w"], "height": 2.6,
              "ceiling": { "lowered": [{ "name": "Bulkhead", "points": [[0, 3], [6, 3], [6, 4], [0, 4]], "height": 2.3 }] } }] }
```

| Field | What it states |
|---|---|
| `site.ground` | The level of the ground outside, in metres from the ground floor's floor level, the datum of a floor's `elevation`: `-0.15` for a floor 15 cm above the ground. One level for the whole site. It sits in the plan's one `site`, beside where the building is ([north, front and where the building is](#north-front-and-where-the-building-is)), and needs no `origin`; it is not `site.elevation`, which is metres above sea level. Rooms text writes it `ground -0.15` (or `ground 0.15 below`), and `grid_set_site` takes it as `ground` (ARE-62) |
| floor `parapet` | Metres the floor's outside walls rise above its roof. Unstated, no parapet |
| room `void` | The room is open to the floor below: no floor of its own |
| room `ceiling` | The room has a ceiling, at its `height` (else its storey's). `lowered` lists the zones lower than the rest, each with `points` (its outline, three or more) and `height` (from the room's floor), and an optional `name`. A zone is clipped to its room |

The slabs, roofs and parapets are in the 3D view (the roofs when the whole building is shown), in
the OBJ and glTF files of each floor (`slab_<floor>`, `roof_<floor>`, `parapet_<floor>`; each
floor's slab lies under its floor level, so floors stacked at their levels meet with no gap), and
in the IFC file: one `IfcSlab` per floor, voided by an `IfcOpeningElement` over each stair, lift
and void, an `IfcRoof` (a flat roof) of an `IfcSlab` `ROOF` over each roofed floor, an `IfcWall`
named `Parapet`, and an `IfcCovering` `CEILING` for each stated ceiling and each lowered zone.
`grid_takeoff` gives each slab and roof's area, every line marked assumed, with what was assumed:
the plan states none. A ceiling plan, lights and grilles are not in the plan yet.

With `site.ground` stated, the ground floor is the floor whose floor level lies nearest the ground,
and a floor stands above the ground by its height over that level: a door to the outside more than
2 m up is named and is no way out. A door, window or doorless opening in an outside wall whose
foot lies under the ground is named, wholly or in part (`opening/below-ground`). Unstated, the
ground floor is the floor at level 0, as before, and nothing is named: every report says the
check needs the ground level. A ground level for each side of a house on a slope comes later.

## Sloped roofs and ceilings

A floor may state its roof (LVL-6), and its walls and rooms are cut to it. Unstated, the roof is
flat on the floor's walls, as above.

```json
{ "floors": [{ "id": "attic", "name": "Attic", "level": 1,
               "roof": { "shape": "gable", "eaves": 1.0, "ridge": 3.6, "ridgeRuns": "east-west",
                         "rooflights": [{ "id": "rl-1", "at": [2, 1.5], "width": 0.78, "length": 1.18 }] } }] }
```

| Field | What it states |
|---|---|
| `roof.shape` | `flat`, `mono-pitch`, `gable` or `hip` |
| `roof.eaves` | Metres above the floor's level to the roof's underside at its eaves, on the outside walls' lines. A flat roof's underside is level at this height |
| `roof.pitch` | Degrees, above 0 and under 90. A sloped roof states its pitch or its ridge, never both |
| `roof.ridge` | Metres above the floor's level to the underside at the top: the ridge of a gable or a hip, the high side of a mono-pitch roof. Higher than the eaves |
| `roof.ridgeRuns` | A gable's only: `east-west` or `north-south`, along the drawing's sides. Unstated, along the longer sides |
| `roof.highSide` | A mono-pitch roof's, and needed there: the side it rises to, `north`, `east`, `south` or `west` |
| `roof.rooflights` | Windows in the slope: each an `id`, `at` (its middle on the plan), `width` along the slope's eaves and `length` up the slope, both measured on the slope |
| `roof.dormers` | Dormers standing out of a slope (LVL-20): each an `id`, `shape` (`box` or `gable`), `at` (the middle of its front on the plan), `width` (its front's), `height` (above the floor's level: a box dormer's flat ceiling, the top of a gable dormer's sides) and, optionally, `depth` (on plan, up the slope from its front; unstated, until it meets the roof) and `pitch` (a gable dormer's own; unstated, the roof's). Sections draw them and the headroom counts the floor under them; the 3D model, elevations, exports and take-off do not show them yet (`floor/dormers-not-drawn`) |

Where the roof stands: its eaves run round the smallest rectangle that holds the lines of the
floor's outside walls (every solid wall when none is stated `exterior`), turned to the longest of
them, so a plan drawn off the drawing's axes gets a roof square to its walls. A gable's two planes
rise from the two sides along its ridge, a hip's four from all four sides at one pitch, a
mono-pitch roof's one from the side opposite its high side. Over an L or a T the planes cover the
whole rectangle: there are no valleys yet.

What it cuts:

- **Walls.** A wall standing inside the roof's rectangle is no higher, along its line, than the
  roof's underside over it: a gable is a gable, and a partition under the slope follows it. A wall
  that states no height, on a floor that states its roof, rises to the roof's top and is cut to it.
  So does a wall stated `exterior` whatever height it states (LVL-20), unless it stands round
  outdoor space alone or rises through floors: an outside wall meets the roof, so a gable end is
  closed and a mono-pitch extension's walls reach their roof; its stated height stays in the file.
  A wall on the building's outside that is not stated exterior keeps its height, and the check
  names the gap over it (`wall/under-roof`). `grid_measure what=wall` gives a wall's top along its
  length.
  A door or window whose top lies above the roof over its stretch of wall is refused, with the
  height that fits at its sill (`opening/above-roof`): the views, the exports and the checks read
  the cut top, and a floor's height (when it states none) is its tallest wall as cut.
- **Rooms.** A room's ceiling is the roof's underside, under its own `height` when it states one.
  Its floor is reported by headroom band ([areas.md](areas.md)), and its height in `grid_measure`
  is given from its lowest to its highest. A stated ceiling and its lowered zones lie only where
  the roof stands higher than them.
- **Rooflights.** Each lies on one slope of the roof, wholly inside it; one that leaves the roof or
  crosses a ridge or a hip is left out (`floor/rooflight-misplaced`). An opening sits in a wall:
  an opening whose `wall` names the roof, a room or a floor is told that a window in the roof is a
  rooflight (`opening/missing-wall`).
- **Dormers** (LVL-20). Each stands on the slope its front is on: a box dormer's underside is level
  at its `height`, a gable dormer's rises from its sides at its pitch to a ridge over its middle,
  and it runs back up the slope by its `depth`, or until it meets the roof. It raises the roof's
  underside where it stands: the section cuts it, and a room's headroom bands count the floor under
  it. One whose front is not inside the roof on one slope, higher than the roof there, or that runs
  past a ridge or a hip or off the roof, is left out (`floor/dormer-misplaced`). Dormers do not
  raise or cut walls yet.

The roof is drawn in the 3D view and the OBJ and glTF files on its slopes, open at its rooflights;
in the IFC it is an `IfcRoof` of its type (`FLAT_ROOF`, `SHED_ROOF`, `GABLE_ROOF`, `HIP_ROOF`) over
one `IfcSlab` `ROOF`, each rooflight an `IfcOpeningElement` filled by an `IfcWindow`. A wall the
roof cuts, and a space under it, are clipped solids, so the file holds the volume under the roof.
A parapet stands on a flat roof only. Rooms text writes the roof as it is, on a `raw floor` line.

## A floor outline before the walls

A floor may state its `outline` (BRF-4, convention C17): its outside face, its corners in plan
metres in order round it, either way round, as the plot's boundary is written; a last point on
the first closes it. It may also state how many `homes` it holds and how many `parking` spaces:
whole numbers, the agent's proposal, which Grid counts against the person's own limits and never
brings a figure for. All three are optional and never defaulted (version 1); a floor that states
none reads exactly as before.

```json
{ "floors": [{ "id": "ground", "name": "Ground floor", "level": 0, "height": 3, "building": "home",
               "outline": [[3, 5], [15.762, 5], [18.482, 22], [3, 22]], "homes": 2, "parking": 3 }] }
```

- **Massing.** A floor with an outline and no walls is massing: its level, height and kind of
  building (`building`) are the floor's own fields, and its outline gives its gross external
  area, its slab, its roof, its place in the plot coverage and the distances to the boundary, and
  a storey. It has no net area and no gross internal area until its walls are drawn, and nothing
  inside it is checked: it gives no `floor/unclaimed` and no `floor/empty-top`, and a plan of
  outlines only is not `plan/empty`. The plan of a floor draws its outline as a line round it.
- **With walls inside it.** The outline is joined with what the floor's walls enclose: the slab,
  the roof and the gross external area cover both, and floor inside the outline that no wall
  encloses, a wing still to draw, is floor no room claims (`floor/unclaimed`), in the gross
  figures only. An outline that is the walls' own outside face changes no figure.
- **Walls past it.** Where the walls reach past the outline the floor states, the floor is
  larger than its outline, and `floor/past-outline` says by how much. The slab, the roof and the
  gross area still take in both.
- **Storeys.** A storey is a level with at least one floor that holds something, an outline or
  walls that close one: two floors at one level are one storey. Those at or above the ground
  floor are counted apart from those below it, and a floor that holds nothing is in none.
- **Homes and parking.** `homes` and `parking` are added up over the floors; the person's own
  parking per home is set against them ([brief.md](brief.md#the-persons-own-figures)).

An outline that crosses itself or encloses no ground is refused as a value, and read part by part
it is left out alone, the floor kept (`plan/value-left-out`). `grid_mirror` mirrors and turns the
outlines with the walls. Rooms text has no word for an outline, homes or parking yet: they are
kept on a `raw floor` line. A shadow picture of the massing is not part of Grid.

## Floor no room claims

Besides the findings, `grid check` lists problems in the drawing. Some of them come from the
spaces the walls enclose: once per floor, Grid joins the wall footprints and takes the spaces
they close off, without looking at any room, and then sets each room's outline against them.
Each of these is a warning ("worth a look"); nothing is left out because of it.

| Code | What it says |
|---|---|
| `floor/unclaimed` | Enclosed floor that no room claims: its area, a point inside it and the walls around it. A forgotten room no longer makes the total smaller in silence. Floor inside a floor's stated outline that no wall encloses counts too ([a floor outline before the walls](#a-floor-outline-before-the-walls)) |
| `room/space-mismatch` | A room whose outline is not the space its walls enclose: how much of it lies on walls it does not list (a pod, a column, furniture drawn as walls), outside the walls, or across a wall or dividing line into another space |
| `room/not-enclosed` | A room its walls do not close off at all, because they leave a gap |
| `floor/spaces-unknown` | A floor whose spaces could not be worked out, with the reason |

The joining uses `polygon-clipping` (MIT), named in `NOTICE`.

## Rooms that overlap, and rooms inside rooms

Grid also sets the rooms of each floor against each other. Two rooms that cover the same floor,
0.01 m² of it or more, get a warning naming both rooms and the floor they share, because that
floor is counted twice: a room that names one wrong wall and grows over its neighbour, or a room
listed twice. Rooms that meet face to face, across a wall or along a dividing line, share no
floor and get nothing.

A wardrobe pod, a lift shaft or an en-suite drawn inside a bigger room is said with
`"inside": true` on the inner room:

```json
{ "id": "ward", "name": "Wardrobe pod", "boundary": ["pod0", "pod1", "pod2", "pod3"], "inside": true }
```

Grid finds the room it sits in from the outlines: the smallest room on the same floor that
holds it. The inner room's floor, with its own walls, is taken off that room, so each square
metre is counted once, in the area of every room, the 2D drawing, the size check and the
comparison of two plans. A door in the inner room's walls opens into the room around it. The
outline of the room around it stays whole; only its area changes.

| Code | What it says |
|---|---|
| `room/overlap` | Two rooms on one floor share floor: both names, each one's area, the shared area and a point inside it. On the larger room, or the later of two copies |
| `room/inside-no-host` | A room marked `inside` that no room on its floor holds, with how much of it lies outside the room that holds most of it. It is counted on its own |
| `room/overlap-unknown` | Two rooms that could not be compared, with the reason |
| `floor/overlaps-unknown` | A floor whose rooms were not all compared: the plan has more than 200,000 pairs of rooms lying over each other (thousands of copies piled in one place), and Grid stopped there |

## Zones inside one room

An open-plan room holds several uses: a studio where you sleep, cook and sit. Draw the room once,
round its own walls, and each zone as a room of its own that names the room in `partOf`:

```json
"rooms": [
  { "id": "studio", "name": "Studio", "boundary": ["ext-s", "ext-e", "bath-s", "bath-w", "ext-n", "ext-w"] },
  { "id": "sleep", "name": "Sleeping corner", "use": "bedroom", "boundary": ["ext-s", "sleep-e", "kit-s", "ext-w"], "partOf": "studio" }
]
```

A zone's outline lies inside its room's, along the room's walls and dividing lines (virtual
walls) of the zone's own. The two overlap on purpose:

- The room is the place. It is measured, counted, reached and checked as a whole. A door or a
  fixture in it is in the room, whichever zone it is in, and the 3D view, the IFC and the floor
  slabs have the room's floor only. A zone's `ceiling`, `void` or floor offset is not read: the
  ceiling, the slab and any opening in it are the room's ([Slabs, roofs, ceilings and the
  ground](#slabs-roofs-ceilings-and-the-ground)), and a zone used as a stair or a lift opens no
  slab of its own.
- A zone is named and measured, and is in no total: `grid_areas` lists it with its room
  (`zoneOf`) and gives its floor to its own use in the area by use, the room schedule lists it
  under its room, and the takeoff, the estimate and the comparison of two plans count its floor
  once, in its room.
- The size and escape checks look at the room as a whole, at its whole area, with the room's own
  use or, when the check does not cover that, its zones' uses: a studio with a sleeping corner is
  checked as a room someone sleeps in, and a finding names the zone it read the use from. The
  studio drawn with zones and drawn as one bedroom get the same result. In the record's
  coverage, the zones are skipped as `part_of_room` and the room is listed in `wholeRooms` with
  the use applied.
- The overlap check leaves a zone and its room alone, and a dividing line that only zones list
  divides no room and makes no space of its own. Two zones of one room that share floor are
  still named (`room/overlap`).

A room is a zone only when the room it names is on its floor, is not a zone itself, and holds all
of it. Otherwise it is counted as a room of its own and named:

| Code | What it says |
|---|---|
| `room/zone-not-in-room` | A room marked as a zone of another that is not on its floor, is a zone itself, or does not hold it, with how much of it lies outside |

Merging two rooms of different uses (`grid_merge_rooms`, `grid edit merge`) asks for the merged
room's use, or keeps both as zones with `zones`: the stretch of wall between them becomes a
dividing line, each keeps its id, name and use, and a new room holds them.

`partOf` is optional and never defaulted, so a plan written before it reads with no key added
(version 1). Rooms text has no word for it yet: a floor with zones is read back in Grid's own
terms, so nothing is lost.

## Flats and flat types

A plan may say which rooms make each flat (a dwelling, a unit), in `flats` (CNT-4, C18), and
state each kind of flat once, in `flatTypes`:

```json
"flatTypes": [{ "id": "one-bed", "name": "One bedroom" }],
"flats": [
  { "id": "A", "name": "Flat A", "type": "one-bed", "rooms": ["A-living", "A-bed1", "A-kitchen", "A-hall", "A-bath"] },
  { "id": "B", "name": "Flat B", "type": "one-bed", "rooms": ["B-living", "B-bed1", "B-kitchen", "B-hall", "B-bath"], "mirrored": true }
]
```

| Field | What it states |
|---|---|
| `flatTypes[].id`, `name` | A kind of flat, stated once and placed many times |
| `flats[].id`, `name` | The flat; its name is read as its id when it states none |
| `flats[].type` | The flat type it is, by id |
| `flats[].rooms` | Its rooms, by id, at least one; on one floor or on several, for a duplex |
| `flats[].mirrored` | The flat is its type's mirror image (a handed flat) |

A flat is a named group of rooms, never a room: it adds no floor and closes no outline, and it is
never read from the rooms' names. What reads it:

- **Areas.** `grid_areas` gives each flat's net area, the rooms it lists counted as the net counts
  them, floor by floor for a duplex, and the rooms in no flat apart, each also to the middle of
  its party walls (ARE-14, [areas.md](areas.md#a-flat-to-the-middle-of-its-party-walls)).
- **Schedules.** `grid_schedule of=flats` lists each flat with its type, rooms, bedrooms and area,
  and the mix by type; the room schedule says each room's flat.
- **The drawing.** Each flat's outline is drawn on its floors: a chain line along the middle of
  the walls round its rooms, in the paper's colour over the walls, so one line runs between two
  flats and a doorway breaks it.
- **The IFC.** Each flat is an `IfcZone` grouping the spaces of its rooms
  (`IfcRelAssignsToGroup`), on every storey it is on, with its id, type, whether it is mirrored
  and its net area in `Grid_Flat`.

Rooms text writes both from a unit that is a flat type ([rooms-first.md](rooms-first.md#many-of-one-room-floors-copied-and-walls-through-floors)).
Nothing in the list is refused; what is wrong in it is named, worth a look, and the flat is read
without it:

| Code | What it says |
|---|---|
| `flat/unknown-room` | A flat names a room the plan does not have, with the room most likely meant; it is not counted |
| `flat/room-in-two` | A flat names a room another flat names too; it is counted in the flat whose id comes first only |
| `flat/unknown-type` | A flat is of a type the flat types do not state, with the type most likely meant |
| `flat/duplicate-id` | Two flats have one id; the first is read and the other left out |
| `flat/duplicate-type` | A flat type is stated twice; the first is read |
| `flat/zone-without-room` | A flat names a [zone](#zones-inside-one-room) and not its room: the zone's floor is counted in its room, so it adds nothing |

Both lists are optional and never defaulted, so a plan written before them reads with no key
added (version 1). Grid's edits do not carry a flat yet: a room merged or split away is named by
`flat/unknown-room` until the flat lists the room that is there now.

## Part of a larger building

Read this when the plan is a flat on the fourth floor, a stand in a hall, or a house drawn with its
neighbours. A plan can say it is part of a larger building (CNT-6, C23), so Grid describes it as
what it is, with no false alarms.

```json
"walls": [
  { "id": "party", "start": [6, 0], "end": [6, 6], "kind": "separating" },
  { "id": "entrance", "start": [0, 0], "end": [3, 0], "kind": "separating", "beyond": "common" },
  { "id": "open-front", "start": [0, 0], "end": [4, 0], "virtual": true, "beyond": "common" }
],
"floors": [{ "id": "f4", "name": "Fourth floor", "level": 0, "above": "neighbour", "below": "neighbour" }],
"buildings": [{ "id": "house", "name": "House", "floors": ["ground", "upper"] }],
"context": [{ "id": "no-12", "name": "No. 12", "points": [[-10.5, 0], [-0.5, 0], [-0.5, 8], [-10.5, 8]], "height": 6 }]
```

| Field | What it states |
|---|---|
| a wall's `kind: "separating"` | A party wall, or a wall between a home and the building's common parts |
| a wall's `beyond` | What lies past its side with no room drawn on it: `outside`, `common` (a common part of the building that is not drawn: a landing, a stair, a hall's aisle) or `neighbour` (another home or property) |
| a floor's `above` | What lies above it: `outside`, `common` or `neighbour` |
| a floor's `below` | What lies below it: `ground`, `outside`, `common` or `neighbour` |
| `buildings[].id`, `name`, `floors` | A building of the plan and the floors that are its own, by id, at least one; a floor in one building at most |
| `context[].id`, `name`, `floor`, `points`, `height` | A shape drawn round the plan for context: its outline, either way round, on a floor (unstated, the ground floor), with a name and a height |

**Separating walls and what lies beyond.** `beyond` holds along every stretch of the wall that has
a room on one side only, so a wall can be a party wall for part of its length ([inside and outside
walls](#inside-and-outside-walls)). A separating wall that states nothing beyond it is read as one
to a common part, the one way a door through it is right. Such a stretch is neither inside nor
outside: it is `separating` in `wallSides`, drawn as the home's outer walls are, not external in
the IFC, never a way out and never an escape window, and the gross external area is measured to
its middle ([areas.md](areas.md)). A wall that states `beyond: "outside"` faces outside, whatever
its kind.

**Doors between homes.** A door, a doorless opening or an open side between rooms of two different
[flats](#flats-and-flat-types), or a door through a wall with a neighbour beyond it, is never a
route: a home is not left through another, and `opening/between-homes` says so. A door onto a
common part that is not drawn is a way on: the flat gets no "leads to a space that is not drawn"
note, and its floor's way out is said not checked, through the common parts
(`floor/not-checked-way-out-common-parts`). Every flat needs a front door, onto a room in no flat,
a common part, a space not drawn or the outside (`flat/no-front-door`). A flat entered only through
doorless openings or open sides, with no door or stair on its way in, is noted too
(`flat/entrance-without-door`).

**Open edges.** A virtual wall with a room on one side only is an open edge, never a door. Its
`beyond` says where it leads; unstated, it leads where the drawing says, to the outside (a way out,
as a terrace's edge is) or into floor no room claims (a way on, with no note). A dividing line,
a virtual wall with two rooms on its sides along any stretch of it, joins those two rooms and
nothing else (ARE-28): where it runs on beside one room only (into the body of a wall it meets,
past the end of a narrower room, or along a row of lines that meet end to end) it leads nowhere,
never outside, unless its `beyond` says so. Rooms text ends a dividing line where its two rooms
stop sharing an edge.

**Above and below.** A floor with more of the building above it (`common` or `neighbour`) has no
roof in any take-off, the 3D view or the IFC; one with more of it below has no ground slab, and is
not a ground floor, so a door from it to the outside is never a way out.

**Buildings.** Each building stacks its own floors from 0, so a garden studio's floor does not
stand on the house's. `grid_areas` gives each building's net, gross internal and gross external
area, the sums of its own floors', and its height. A floor no building names is stacked with the
others no building names. The list's own faults are named, worth a look, and the building is read
without them:

| Code | What it says |
|---|---|
| `plan/building-unknown-floor` | A building names a floor the plan does not have, with the floor most likely meant; it is left out |
| `plan/building-floor-in-two` | A floor is named by two buildings; it is in the one listed first only |
| `plan/building-duplicate-id` | Two buildings have one id; the first is read |

**Context.** A context shape is drawn, dashed, on its floor's plan, and framed with it. It is never
a wall, a room or a part of any building: it is in no area, check, count or export of the building,
so neighbours drawn for context add 0 m² (lab EL-17).

All of these are optional and never defaulted, so a plan written before them reads exactly as
before (version 1).

## A way out that leads somewhere, and rooms to let

A way out is a door or doorless opening a person fits through ([tolerances.md](tolerances.md),
`passableWidth`) that leads to open air, on a floor at the ground (MSG-17). Two things that once
counted no longer do:

- **A courtyard closed in on every side.** A door through a wall stated `exterior` onto outside
  floor that walls close in on every side, a courtyard or a light well no room claims, leads to
  open air only if a door or doorless opening leads on from it, with no room on either side, to
  floor no wall encloses: a gate or a passage to the street. Without one the door is not a way
  out. Where it is why the floor has none, `opening/into-closed-court` names the door beside
  `floor/no-exit`; beside a street door it says nothing, as a courtyard door. A courtyard drawn as
  a room (an [outdoor space](#outdoor-space-roofed-or-open) or a room of no use) was read this way
  already: a route leaves through it only by a door from it to the outside.
- **A door to the outside above the ground** is not taken as a way out, and where it leads (a
  balcony, a terrace, an outside stair) is not looked at: `opening/door-out-above-ground` is a
  `not-checked` line. A way out from an upper floor is followed down a stair ([stairs that join two
  floors](#stairs-that-join-two-floors)).
- **A door onto a floor much higher than its own** (LVL-17). A door or doorless opening between two
  rooms of one storey whose floors (their `floorOffset`) stand further apart than a step
  ([tolerances.md](tolerances.md), `passableRise`) is not a way through, and no route passes it:
  `opening/between-levels` names it with both rooms and both levels. A room whose only door it is
  has no route out. A door from or into a room used as a `stair` is a way through whatever the
  levels: the stair is how a person climbs between them. A dividing line between two such rooms
  is still an open side.

**Rooms to let.** A let is a [flat](#flats-and-flat-types), or a room whose `tenure` is `private`
in no flat when the plan marks some room `common` or `shared` (a house of rooms to let, student
rooms, a hotel). Where nothing is common, the private rooms are one household's and nothing is
asked. A let's way out goes through its own rooms and through rooms no let holds, up and down the
stairs; when every way out of it passes through a room another let holds, `room/through-another-let`
names the let and the rooms it goes through. A private bathroom, toilet, store or utility room in
no flat is an en-suite: no let of its own, and no other let passes through it. A let no route
reaches at all is said as before (`room/no-route-out`, `flat/no-front-door`).

| Code | When |
|---|---|
| `opening/into-closed-court` | the floor's only way out is a door onto a courtyard closed in on every side |
| `room/through-another-let` | every way out of a let passes through a room another let holds |
| `opening/between-levels` | a door or doorless opening between rooms whose floors stand further apart than a step, neither of them a stair |
| `opening/door-out-above-ground` (`not-checked`) | a door to the outside on a floor above the ground: not a way out, and where it leads is not looked at |

These are checks on the drawing, from Grid's own reading of it, and cite no document.

## Outdoor space, roofed or open

Read this when a plan draws a garden, a courtyard, a terrace, a balcony, a light well, a porch or
a carport. A room may be marked as outdoor space (CNT-7, C26), so the drawing shows it and the
figures leave it out.

```json
"rooms": [
  { "id": "garden", "name": "Back garden", "boundary": ["back-line", "plot-e", "plot-n", "plot-w"], "outdoor": "garden" },
  { "id": "porch", "name": "Porch", "boundary": ["ext-s", "por-e", "por-s", "por-w"], "outdoor": "porch" },
  { "id": "terrace", "name": "Terrace", "boundary": ["ext-n", "ter-w", "ter-n", "ter-e"], "outdoor": "terrace", "roofed": true }
]
```

| Field | What it states |
|---|---|
| a room's `outdoor` | That the room is outdoor space, and its kind: `garden`, `courtyard`, `terrace`, `balcony`, `light-well`, `porch`, `carport` or `other` (a driveway, a side passage). `true` is outdoor space of no named kind, read as `other` |
| a room's `roofed` | Whether a roof covers it. Unstated, a porch and a carport are roofed and every other kind is open. Read only with `outdoor` |

An outdoor space is drawn and measured as a room is, and to the building it is the outside:

- **Areas.** It is in no net, gross internal or gross external area, no area by use and no flat's
  area. It is listed apart, by kind and roofed or open ([areas.md](areas.md#outdoor-space)).
- **Walls.** A wall between a room and an outdoor space faces outside ([inside and outside
  walls](#inside-and-outside-walls)), and is external in the IFC. A wall that bounds outdoor space
  and no room (a fence, a parapet round a terrace, a balcony's edge, the plot drawn as dividing
  lines, a porch's or a carport's posts) is no part of the building: it is in no area and sets no
  storey height, so a tall garden wall leaves the house at its own height.
- **Checks.** It needs no door and no route of its own: a courtyard with no door, or a garden
  fenced in, gets no note. A route may pass through it, so a door onto a terrace or a garden is a
  way out when the space leads on to the outside, through an open edge or a door or gate in its
  fence; a door onto a terrace closed all round is not, and the floor's way out is said missing as
  before. A door onto a balcony above the ground is never a way out. No figure check reads an
  outdoor space, whatever its `use` says, and a bedroom window onto one is a window to the open air.
- **Slabs and roofs.** On the lowest level an outdoor space stands on the ground: the slab is the
  building's alone. Above it (a balcony, a roof terrace) it stands on a slab, as the floor does. Only
  a roofed one is roofed: the 3D view, the GLB, the OBJ and the IFC put a roof over a porch or a
  carport and none over an open terrace, a garden or a courtyard (lab EL-18). An open courtyard or
  light well above the lowest level that lies over open sky on the floor below has no slab either:
  the sky reaches down through every floor of it (LVL-12). A roofed outdoor space on a floor with
  no building to roof with it (a canopy on columns, drawn alone) is roofed at its stated `height`,
  else at the height of the tallest column standing in it, else at the storey's height; beside
  the building it is roofed with the floor, at the storey's height.
- **A courtyard not drawn as a room.** Floor the walls enclose that no room on its floor claims is
  read as floor someone has not drawn yet. It is read as open sky instead (LVL-12) when a window in
  a wall of a room looks into it, or when the greater part of it lies over open sky on the floor
  below (an open outdoor space there, or floor read as open sky the same way). Open sky has no slab
  and no roof in any view, export or section, a wall beside it faces outside, and the check does
  not call it floor no room claims. The areas still count it as floor no room claims: draw it as
  `outdoor: "courtyard"` to take it off them.
- **Exports.** The IFC writes it as an external space (`EXTERNAL`, `IsExternal` true), and
  `Grid_Space` holds its kind and whether it is roofed; its area there is outdoor area. In the GLB
  its floor's node carries `extras.gridOutdoor` and `extras.gridRoofed`; in the OBJ a comment
  `# grid-outdoor <kind> roofed=<true|false>` comes before its floor.
- **Rooms text.** A room line may end `outdoor <kind>` and then `roofed` or `unroofed`
  ([rooms-first.md](rooms-first.md)). A room marked `outdoor: true` has no words of its own there,
  so its floor is read back raw. The wall rooms text works out between a room and an outdoor space
  is an outside wall, `exterior` at the outside thickness, unless a line states it.

Both fields are optional and never defaulted, so a plan with no outdoor space reads, checks and
exports exactly as before (version 1).

## Rooms with holes

A ring gallery round a courtyard, or a car park round a core, is one room with a hole in it. Its
`boundary` lists the walls round the outside, as for any room, and `holes` lists the walls round
each hole, one list per hole, in the order they are met going round it:

```json
{ "id": "ring", "name": "Ring gallery", "boundary": ["os", "oe", "on", "ow"], "holes": [["cw", "cn", "ce", "cs"]] }
```

The room's floor is its outline less each hole, measured to the faces of the hole's walls that
look into the room, so those walls are not floor either. That one area is what the room's area,
the 2D drawing, the size check and the comparison of two plans give. Its label goes on its
floor, never in a hole; the 3D floor, the OBJ and GLB floors, the IFC space (as a profile with
voids) and the DXF (one more closed outline on the rooms layer) all leave each hole open, and the
floor's slab and roof are open over the floor inside a hole that no room fills. A door in a hole's wall leads from the room to whatever is in the hole: a room drawn
there, or the outside. A plan with no `holes` reads and measures as before.

| Code | What it says |
|---|---|
| `room/hole-outside` | A hole that does not lie inside its room with floor all round it: it reaches or crosses the outline. The room is not drawn |
| `room/holes-overlap` | Two holes of one room that overlap or touch. The room is not drawn |

A hole whose wall list cannot close, or is out of order, gets the same codes as an outline
(`room/unclosed`, `room/out-of-order`, `room/inside-out`), and the line names the hole.

## A curved wall

A wall may be an arc of a circle (CNT-18). It states `arc`: its `centre`, and its `sweep`, the
angle in degrees it turns through round the centre from `start` to `end`, counter-clockwise
positive as every turn in a plan is. Its radius is the distance from the centre to `start`, and
`end` lies on the circle where the sweep takes it. A whole circle sweeps 360 (or -360), and its
`start` and `end` are one point:

```json
{ "id": "round", "start": [8, 5], "end": [8, 5], "thickness": 0.2, "height": 2.7, "kind": "exterior", "arc": { "centre": [5, 5], "sweep": 360 } }
```

A round room is that one wall (`"boundary": ["round"]`); a half-round bay is a straight wall's
worth of room with one wall of `"sweep": 180` across its open side; a stair tower is a room of
one curved wall on each floor. A wall that states no `arc` is straight, and a plan with none
reads exactly as before (version 1). An `arc` Grid cannot read (with no centre, or a sweep of 0
or past a whole turn) is read as not stated, as a door's hinge is: the wall is drawn straight,
and `grid check` says so (`plan/value-left-out`).

The wall grows half its thickness either side of its curve, as a straight wall does of its line
(C1); its `left` face is the one on the left going from `start` to `end`, the inside of a
counter-clockwise curve. An opening's `offset` and `width` are measured along the curve (C2), so
`offset + width` is never more than the wall's length along it; its hole is straight between its
two edges, as a door's leaf is, so a 0.90 m door on a 3 m radius is a hole 0.897 m across. The
door swings from that straight edge.

Grid works the room's outline out along the inside face of the curve, piece by straight piece,
each no more than `arcSagitta` (1 mm) off the curve and turning no more than `arcStep` (0.03
radians): a round room of 2.9 m inside radius measures 26.417 m² against the 26.421 m² of the true
circle, 0.016% short. The same pieces are what the area, the spaces, the outside walls and
the checks read; the gross internal area cuts a curved outside wall from the floor as one band
along those pieces, so a plate with round corners measures as a square one does (CNT-22). The 2D drawing, the sheet and the DXF draw the wall's faces as arcs; the 3D
view raises it as flat pieces mitred to each other, with a lintel over each hole. What each
export writes as pieces it says ([commands.md](commands.md#what-an-export-leaves-out-hnd-6)).

Rooms text writes straight walls: a floor with a curved wall is read back in Grid's own terms
(`raw wall` lines), which keep the curve. The room edits (move a side, merge, split, add a room
against a wall, stretch) leave a curved wall as it is and refuse a change that would move or cut
one. A curved wall an edit does not touch is no reason to refuse it: two rooms that share a
straight wall merge though either has a curved wall round it (CNT-22); an opening on it can still be widened, moved along it from its start or end, or turned.
Squaring a scan leaves a curved wall as it is, and refuses to square a wall that ends on one.
The wall faults leave a curved wall out: none of them is about one, and `grid tidy` moves none.

| Code | What it says |
|---|---|
| `wall/arc-ends-apart` | The wall's end is not on its circle where the sweep takes its start, by more than `arcEnds` (5 mm): the line says where the end should be. The wall is not drawn |
| `wall/arc-too-tight` | The radius, from the centre to the start, is no more than half the wall's thickness, so its inside face has no curve. The wall is not drawn |

## Opening patterns

A facade's rhythm may be stated once, in the plan's `patterns` (LVL-8): one opening, the wall it
goes in, how many or how far apart, the margins kept clear at the wall's ends, and the floors
above to repeat it on.

```json
"patterns": [
  { "id": "north-row", "wall": "gn", "opening": { "type": "window", "width": 1.2, "height": 1.4, "sill": 0.9 },
    "count": 4, "margins": { "start": 1, "end": 1 }, "floors": ["first", "second"] }
]
```

| Field | What it states |
|---|---|
| `id` | The pattern's id, unique in the plan like every id |
| `wall` | The wall the openings go in, by id |
| `opening` | The opening repeated: `type`, `width`, `height`, `sill` (0 when unstated), its `kind` and the part that opens (`opens`, CNT-14) and, for a door, `hinge` and `swing`, as an opening states them. On a wall above drawn the other way, `hinge` and `swing` are turned with it, so each door hangs from the same jamb and opens to the same side |
| `count` | How many: spread evenly, the first one's near edge at the start margin and the last one's far edge at the end margin; one alone sits in the middle |
| `spacing` | How far apart, centre to centre, in metres: the first at the start margin, as many as fit before the end margin. With `count` too, that many, from the start margin |
| `margins` | `start` and `end`: metres kept clear from the wall's start and from its end, along its axis, as an opening's offset is measured. Each 0 when unstated |
| `floors` | Optional: the floors above to repeat it on. On each, the openings stand where they stand on the pattern's wall, on the wall of that floor in the same line, whichever way it is drawn |

A pattern states one of `count` and `spacing`, or both; with neither it is left out, as any part
Grid cannot read is (`plan/part-left-out`).

A pattern is never an opening. Grid expands it into plain openings, with ids
`<pattern>-<floor>-<n>` (`north-row-first-2`), before it draws, measures, checks or exports the
plan, so every view, the checks (a window a pattern places counts for escape like one placed by
hand), the schedules and every export read plain openings only: a plan with a pattern exports
exactly the DXF, IFC, OBJ and GLB of the same plan with those openings written out by hand. Each
offset is kept to the micrometre, as a person writes it. The file keeps the pattern, never its
openings: `grid write`, `grid tidy` and the tools that change the plan leave `patterns` as the
file has them, and rooms text (`grid describe --as rooms`) holds the openings the file states and
says the patterns are kept apart. A pattern on a wall that moves follows it; one whose wall is cut
or renamed by an edit names a wall that is gone, and says so.

What a pattern cannot place is said, never dropped in silence. Each is left out, the rest placed:

| Code | What it says |
|---|---|
| `pattern/unknown-wall` | It names a wall the plan does not have (with the nearest id), or one two walls share. None of its openings is placed |
| `pattern/does-not-fit` | Its openings do not fit between the margins: how much room they need and how much there is; or its spacing is less than its openings' width. None is placed |
| `pattern/unknown-floor` | It is to be repeated on a floor the plan does not have. Nothing is placed there |
| `pattern/no-wall-above` | On a floor it repeats on, no wall in the line of its own holds an opening's whole width: which openings are not placed there |
| `pattern/overlaps-opening` | One of its openings would lie over another opening on its wall, one placed by hand or by another pattern. That one is not placed |
| `pattern/id-clash` | An id it would give is another part's. That opening is not placed |

## Fixtures

A plan may list its fixtures and furniture in `items`: a toilet, a basin, a shower, a bath or a
kitchen run (base units with their worktop), and a bed, a table, a chair, a sofa, storage (a
wardrobe, a cupboard, shelves, a TV unit), an armchair, a stool, a desk, a rug or a plant
(CNT-42). Each has a `kind`, `at` (the middle of its footprint), a
`size` (its width along its back and its depth to its front), a `height`, and may have a `turn`
(degrees, counter-clockwise; unturned, its back faces down the drawing), a `label`, a
`floor` and a `clearance` (metres of clear floor kept in front of it). An item may instead name
a library entry in `library`, which gives what it leaves out (CNT-20, C30: [library.md](library.md)).
Every other figure is the author's.

```json
{ "id": "wc", "kind": "toilet", "at": [9.575, 5], "size": [0.4, 0.65], "height": 0.8, "turn": 90, "label": "WC" }
```

A fixture is never a wall and never a room: it adds no floor area and no finding, and the room
it stands in is the one that holds its middle. The 2D drawing, the sheet and the DXF (layer
`GRID-FIXTURES`) draw its symbol to scale inside its footprint; the IFC file holds it as an
`IfcFurnishingElement` on its storey. The 3D view, the stills and eye views, the OBJ and the GLB
(`item_<id>`) raise it as a few plain blocks its kind gives, inside its footprint and up to its
height, on the floor of its room: a table and a desk a top on four legs, a chair a seat and a back,
a sofa and an armchair a seat, a back and two arms, a plant its pot and leaves, any other its
footprint to its height (CNT-42). `grid_schedule` counts the fixtures by kind with their
rooms, `grid_areas` gives each room with fixtures its free floor (its net area less the floor
they stand on), and each zone, flat and floor and the plan theirs ([areas.md](areas.md#free-floor)), `grid_measure` measures between fixtures and fits a box clear of them, and
`grid check` names a fixture that runs into a wall or is taller than its room. A fixture is an
obstacle (CNT-13): a door whose leaf swings into it names it, and `grid_measure what=use` and
`what=route` with a width measure the turning circle, the way through and the floor round each
fixture clear of them ([use indicators](tool-server.md#use-indicators-will-it-fit-can-you-turn-is-the-window-blocked)). Furniture is drawn,
exported, measured and checked as a fixture is, and takes no free floor: it can be moved. The DXF
writes each item as a block ([library.md](library.md#the-dxf-each-door-and-fixture-a-block)).
A rug lies on the floor (CNT-42): other items stand on it without standing in each other, and it
is in no item's clear floor, no doorway, no way through and no fixture's space; it is still
drawn, exported and counted.
Rooms text writes an item in an `item` line, against a side of a room with its turn worked out or
at a point (CNT-45, [rooms-first.md](rooms-first.md#items)), and `grid_add_item`, `grid_move_item`
and `grid_remove_item` add, move and take one out. An item whose back stands against a wall's
face (to within `itemIntoWall`) moves with that wall when a change or a rewrite moves it, and
one in a corner keeps to both walls. `grid_find` and `grid_count` take `fixture` and `furniture`
as kinds of part, `grid_view` gives each item's box, and `grid_schedule of=fixtures` lists them.
A phone scan's furniture and appliances come in as items too (a fridge or a stove as storage,
labelled with what the scan calls it), and each scanned door keeps whether the scan saw it open
as the fact `scannedOpen`.
Points (a hydrant, a camera) and seats come later, in the same shape. A kind Grid does not hold
is left out with a note, and the rest of the plan is drawn; a kind is added through the kinds
registry ([library.md](library.md#adding-a-kind-of-thing)).

| Code | What it says |
|---|---|
| `item/unknown-kind` | A kind Grid does not hold, such as a piano. The item is left out |
| `item/too-large`, `item/no-size` | A number Grid does not accept, or no size. The item is left out |
| `item/duplicate-id`, `item/unknown-floor` | An id another part has, or a floor the plan does not have. The item is left out |
| `item/outside-rooms` | Its middle is in no room on its floor |
| `item/into-wall` | It reaches more than 5 mm into a solid wall |
| `item/too-tall` | It is higher than the room it stands in |
| `item/leaves-room`, `plan/column-in-item`, `plan/column-overlap` | An item whose floor hangs out of its room through a doorway or an open side, a column standing in an item, and a column standing in another column |
| `item/unknown-library`, `item/overlap`, `item/clearance-blocked` | A library name no library holds, an item standing in another, and something in the clear floor an item keeps ([library.md](library.md#what-grid-checks)) |
| `opening/door-hits-item` | A door's leaf swings into the fixture: the line names it by its label, kind and id, `Door "d1" hits "Table 2" (kitchen run "table-2") when it opens` |
| `item/blocks-doorway` | It stands within 0.3 m (`useApproachDepth`) in front of a doorway's hole: the line says how much of the hole it covers and the clear width left, as an indicator |
| `item/blocks-window` | It is higher than a window's sill and stands within 0.3 m in front of it: the line says how much of the window it covers, as an indicator |

## Columns and a structural grid

Read this when the building stands on columns: an open office, a warehouse, a car park, a carport.
A column is a thing of its own (CNT-16, C25), never a very short wall, a room or a fixture, so it
comes off the room's area, exports as a column and draws as one.

```json
"columns": [
  { "id": "c1", "shape": "square", "width": 0.4, "at": [7.5, 10], "height": 6 },
  { "id": "c2", "shape": "round", "width": 0.5, "at": [15, 10], "label": "C2" },
  { "id": "c3", "shape": "square", "width": 0.3, "depth": 0.6, "at": [22.5, 10], "turn": 90, "through": "first" }
],
"grids": [
  { "id": "main", "name": "Main grid", "origin": [0, 0], "x": { "spacing": [7.5, 7.5, 7.5, 7.5] }, "y": { "spacing": [10, 10] } }
]
```

- `shape` is `square` or `round`. `width` is a square column's side along its own x and a round
  column's diameter; `depth` is a square column's side along its own y, and unstated it is as wide
  (a square). A round column with a `depth` is refused. `at` is its middle; `turn` turns a square
  column counter-clockwise, in degrees.
- `floor` is the floor it stands on (unstated, the ground floor). `through` names the highest
  floor it rises through, as a wall's does ([Walls through floors](#walls-through-floors-and-floors-that-line-up)):
  one column on each of those floors. `height` is how high it stands above the floor it rises
  through; unstated, it is that floor's storey height. A `through` that reaches no floor above its
  own is said (`plan/column-through-floor`), and the column stands on its own floor only.
- The room a column stands in is found from the outlines, never named: the smallest room on its
  floor whose floor holds its middle, zones aside. The floor it covers inside that room's outline
  comes off the room's net area ([areas.md](areas.md)), on each floor it stands on.
- A column with an id another part has, on a floor the plan does not have, or too large to build
  is left out of every view, measure and export (`plan/column-duplicate-id`,
  `plan/column-unknown-floor`, `plan/column-too-large`).
- It is drawn cut through, as the walls are, filled in the outside walls' tone, and is in the
  drawing's key. The IFC writes each as an `IfcColumn` on its own floor's storey, swept from that
  storey's level to its top, with its length, cross-section and volume; the DXF puts it on its own
  layer (`GRID-COLUMNS`), a round one as a true circle; the OBJ and the GLB hold a solid for each
  (`column_<id>`); the 3D view and the sheet's still show it. `grid_takeoff` counts the columns by
  shape and size, with their metres and volume, and `grid describe` says each floor's.

A structural grid is a named set of lines the columns are set out on. Its `x` lines run along the
grid's own y, the first through `origin`, each `spacing` metres past the one before; its `y` lines
run along its x. `turn` turns the whole grid counter-clockwise, in degrees. A set's `names` name
its lines in order, one each (a set with no spacing is one line); unstated, the x lines are
numbered 1, 2, 3 and the y lines lettered A, B, C, then AA, AB. The schema refuses names that do
not match the lines, two lines of one grid with one name, and more than 100 lines in a set
(`gridLinesMost`). `floors` names the floors it is drawn on; unstated, every floor, and a floor it
names that the plan does not have is said (`plan/grid-unknown-floor`).

The grid is drawn only: each line a chain line running `gridOverrun` (1.5 m) past the outermost
line across it, its name in a circle past both ends, and its spacing dimensioned line to line
along the lines' start and in all along their other end (dimensions of kind `grid`, to the lines'
centre lines). Both looks draw it, so it is on the screen, in every picture, on the sheet and in
`grid draw`; the DXF puts the lines, circles and names on `GRID-STRUCTURAL-GRID` and the spacing
with the other dimensions. It is in no measure, check or count, and places no column: a column
states its own `at`.

## Parking bays and ramps

Read this when the plan holds a car park: a basement, a podium, a garage. A parking bay and a ramp
are things of their own (CNT-19, C29): a bay is never a room closed by dividing lines, and a ramp
is never a flat room with its slope in its name, so each floor counts its bays and a ramp's slope
is a number.

```json
"bays": [
  { "id": "bay-1", "number": "1", "at": [4.85, 15.4], "width": 2.5, "length": 4.8, "floor": "B1" },
  { "id": "bay-9", "number": "9", "at": [17.25, 5.1], "width": 2.5, "length": 5, "turn": 0, "floor": "B1" }
],
"ramps": [
  { "id": "ramp", "name": "Car ramp", "from": "B1", "to": "ground", "width": 3.2, "run": [[1.8, 9], [1.8, 27]], "slope": 16.7 }
]
```

- A bay's `at` is its middle, `width` its size across (side to side) and `length` its size along
  (the way a car drives in), in metres. Unturned its length runs along the plan's y; `turn` turns
  it counter-clockwise about its middle, in degrees. `number` is its number as marked, as text
  (`"12"`, `"B1-07"`). `floor` is the floor it is on (unstated, the ground floor).
- Bays are counted per floor, numbered or not, and a floor's numbers are listed in number order (2
  before 10). A bay takes nothing off the area of the room it stands in: a car park's floor is its
  room's. Two bays of one floor with one number (`plan/bay-number-repeated`) and two bays that
  share more than `bayOverlap` (0.01 m²) of floor (`plan/bays-overlap`) are said, and both are
  counted. A bay with an id another part has, on a floor the plan does not have, or too large to
  build is left out of every view, count and export (`plan/bay-duplicate-id`,
  `plan/bay-unknown-floor`, `plan/bay-too-large`).
- A ramp is stated once across the two floors it joins, as a [stair](#stairs-that-join-two-floors)
  is: `from` and `to` are the floors (either may be the higher), `width` its width across its
  middle line, and `run` that middle line from its edge on `from` to its edge on `to`; each point
  between is a turn. A straight ramp may say `start` and `end` instead of `run`. Its middle line
  may run past the floor's outline: a ramp out of a basement ends in the street.
- The two levels it joins are its floors' levels in metres ([Floor levels and
  heights](#floor-levels-and-heights)). Grid works out its rise (the upper level less the lower),
  its length along its middle line on plan, and its slope: the rise per 100 m of that length, in
  percent, and the same as "1 in n". `slope` states the slope the design means, also in percent.
  Grid keeps it beside the worked one and never puts one in place of the other; when the two are
  more than `rampSlopeDiffers` (0.5 percentage points) apart, it says so
  (`plan/ramp-slope-differs`), with the rise and the length.
- A ramp with an id another part has, a floor the plan does not have, the same floor at both
  ends, two floors at one level, a middle line with no length, or a number too large to build is
  left out (`plan/ramp-duplicate-id`, `plan/ramp-unknown-floor`, `plan/ramp-same-floor`,
  `plan/ramp-no-rise`, `plan/ramp-no-run`, `plan/ramp-too-large`). A slope within one floor, such
  as a ramp up to a front door, is not a ramp Grid reads yet.
- A ramp opens the slab of its upper floor over the whole of it, where the slab is (an opening of
  kind `ramp`, as a stair opens its), so the 3D view, the IFC's slab and `grid_takeoff`'s slab area
  leave the hole.
- Each bay is drawn as its marking, its number in its middle; each ramp on both floors it joins,
  its outline, its middle line ending in an arrow head pointing up, and its slope written halfway
  along. Both looks draw them, so they are on the screen, in every picture, on the sheet and in
  `grid draw`, with entries in the drawing's key. `grid_takeoff` counts the bays on each floor
  with their numbers and gives each ramp's two levels, rise, length and slope as numbers (`bays`
  and `ramps`), and `grid describe` says each floor's.
- Whether a car can turn into a bay or up a ramp is a swept-path check: bays and ramps make one
  possible, and Grid does not make it. Nothing here says a bay or a ramp is large enough or not
  too steep: General guidance, not your local rules.

## The plan's name

`name` is the plan's own name, as the `plan "<name>"` line of rooms text gives it. `grid write`
keeps it, and a rooms text with no `plan` line leaves the file's name as it is. The client and
check sheets head their pages with it (a name in `sheet.json` still names the client sheet), the
IFC project carries it, and `grid describe --as rooms` writes the `plan` line back. A plan with
no name is called after its file, as before. It is not the `title`, which is drawn on the picture.

## Writing on the drawing, and the sketch layer

A plan may carry writing for its drawings (SHT-7). None of it is measured or checked, and none
of it changes an area, a check or a wall count.

- `title`: one line, drawn in the band under every floor's picture. The sheet leaves it off,
  because each page has its own title.
- `annotations`: notes, tags, symbols and a key. Each has an `id` and a `kind`:
  - `note`: `text`, drawn as it is;
  - `tag`: `text` in a box;
  - `symbol`: `symbol`, `north` (an arrow pointing up the drawing, turned by `turn` degrees
    counter-clockwise) or `entrance`, with `text` under it if given;
  - `key`: the drawing's key, in the band under it. It lists only what the drawing shows: the
    kinds of wall, windows, doors with their swing, the room uses when rooms are coloured by
    use, each sketch category, and the marks of what went wrong.

  A note, tag or symbol is placed `at` a point, `[x, y]` in metres, on its `floor` (unstated,
  the ground floor), or in a `room`, by id, where it goes under the room's name. Both at once is
  refused. A note in a room the plan does not have is not drawn (`plan/note-no-place`).
- `sketch`: lines, arcs, rectangles, shapes and text, each with an `id`, a `kind`, a `category`
  (the author's word for it: `garden`, `street`, `fence`) and a `floor` (unstated, the ground
  floor). Each kind needs its own fields:

  | Kind | Fields |
  |---|---|
  | `line` | `points`, two or more |
  | `shape` | `points`, three or more, closed back to the first |
  | `rect` | `from` and `to`, two opposite corners |
  | `arc` | `at` (its centre), `radius`, and `start` and `end` in degrees counter-clockwise from +x; it runs counter-clockwise |
  | `text` | `at` and `text` |

  A sketch is drawn in a soft line in every plan picture, the app's 2D view and the sheet, under
  the walls, and framed with the plan. A DXF puts each category on a layer of its own,
  `GRID-SKETCH-` and the category in capitals. Grid never takes a sketch as a wall, a room or
  anything it understands, and the record says so once per floor, as a line not checked
  (`floor/sketch-drawn-only`). Where a sketch is something Grid holds, such as a fixture, write
  it as that instead: a fence, a path, a tree or a pool is one of [the site's things](#the-plot-its-boundary-set-backs-and-what-is-on-it);
  furniture will be offered the same way once Grid holds it.

A field the format does not have, on a note or a sketch item, is named like any other
(`plan/unknown-field`). The 3D views do not show the sketch yet.

## Facts of your own, and room numbers

A wall, a door, a window, a doorless opening, a room and a floor may carry facts of the
person's own, in `properties` (CNT-9): a name and a value each, the value text, a number, or
true or false. A room may state its number in `number`, as text.

```json
{ "id": "d-entry", "wall": "gs", "type": "door", "offset": 1.5, "width": 1, "height": 2.1,
  "properties": { "fire rating": "EI 30", "door set": "DS-01", "self-closing": true } }
{ "id": "g-office", "name": "Open office", "number": "G.02", "boundary": ["gs", "gx2", "gn", "gx1"],
  "properties": { "department": "Sales", "head count": 8 } }
```

The facts sit in their own object, never as loose fields of the part, so a misspelt field of the
format is still named (`plan/unknown-field`). A name is one line and not blank; one part may not
carry two names that differ only in capitals, spaces, dashes or underscores, which Grid matches
as one fact. A fact that cannot be read (an empty text, a list, a second name for the same fact)
is left out on its own, with a `plan/value-left-out` line, and the part keeps its other facts.

Grid checks nothing against a fact. A fire rating is the person's statement: no line says a door
or a wall meets one, and no check reads one. What Grid does with them:

- **Edits keep them.** Every change keeps the facts of the parts it changes. A wall cut in two
  (merging rooms, building a room against it) gives both pieces the wall's facts. A room split in
  two gives the new room the room's facts, and the room keeps its number; the new one has none.
  Two rooms merged keep the first room's facts and number, take the second's facts the first
  does not carry, and say what the second said otherwise and which number is gone. `grid tidy`
  does the same: a copy of a wall taken out gives its facts to the wall kept, where it has none
  of that name, and a room split along a wall across it gives both parts its facts. A plan read
  back as rooms text and written again keeps each part's facts and number by its id, and names
  the parts that carried some and are no longer there.
- **Schedules list them.** In `grid_schedule`'s room schedule a room that states its number is
  listed first on its floor, by that number, and given it; the other rooms follow, by id, with
  Grid's number. Every row of the room and opening schedules carries its part's facts, and the
  CSV has one column per fact. The check sheet's schedules show them too.
- **Exports carry them.** The IFC gives each part that carries facts one property set,
  `Grid_Properties`, of one `IfcPropertySingleValue` per fact (`IfcLabel`, `IfcInteger`,
  `IfcReal` or `IfcBoolean`), related to its wall, door, window, opening, space or storey by an
  `IfcRelDefinesByProperties`; a room's stated number is the space's name, its name the long name,
  and the number is in its set as `room number` too, and in `Pset_SpaceCommon` and `Grid_Space`
  where a room that states none has Grid's count
  ([what the IFC holds](commands.md#what-the-ifc-holds-hnd-2)). The DXF writes each fact as one
  line of text on the layer `GRID-FACTS`, `[id] name: value`, beside its part (a floor's over the
  drawing's upper left corner, above its dimensions). A plan with no facts writes none.
- **The tool server asks across them**: `grid_fields`, `grid_find` and `grid_count`
  ([tool-server.md](tool-server.md#asking-across-the-parts-fields-find-and-count)).
- **A tool and a room line write them** (WRT-74): `grid_set_facts` sets and takes out facts and
  a room's number on parts by id, or on every part a `where` picks; rooms text writes a room's on
  its line, `number "2.03"`, `dept "ED"` (the fact `department`) and `facts department=Sales
  capacity=4`, and `grid describe --as rooms` writes them back there ([rooms-first.md](rooms-first.md)).

A fact travels with the plan into every export, like a room's name: keep people's names out of
facts too ([People are kept out of the plan](#people-are-kept-out-of-the-plan)).

## Kinds of door and window, their handing and the part that opens

A door or a window may state its `kind`, and the part of it that opens, `opens` (CNT-14). Both
are optional: a door that states no kind is one swinging leaf, and a window that states none is
drawn and measured as before.

```json
{ "id": "dock-1", "wall": "north", "type": "door", "kind": "roller", "offset": 2, "width": 3.5, "height": 4.5, "swing": "right" }
{ "id": "d-entry", "wall": "gs", "type": "door", "kind": "single", "offset": 1, "width": 1.8, "height": 2.1, "hinge": "start", "swing": "left", "opens": { "width": 1 } }
{ "id": "w-bed", "wall": "e", "type": "window", "offset": 0.6, "width": 1.2, "sill": 0.9, "height": 1.2, "opens": { "width": 0.6, "height": 1.2 } }
```

| Kind | A door | A window | Sweeps the floor | Needs |
|---|---|---|---|---|
| `single` | one swinging leaf (a door with no kind is this) | one casement | its quarter disc, as wide as the part that opens | `hinge` and `swing` |
| `double` | a pair of leaves, one from each jamb | two casements | a quarter disc from each jamb | `swing`; `hinge` names the main leaf's end |
| `folding` | panels that fold to one side, `foldingPanel` (0.6 m) wide at most | | a strip along it one panel deep | `hinge` (the end it folds to) and `swing` |
| `sliding` | two leaves that slide past each other in the wall | two panes that slide | nothing | nothing |
| `pocket` | a leaf that slides into the wall | | nothing | nothing; `hinge` names the end it slides into |
| `roller` | a curtain that rolls up | | nothing | nothing; `swing` names the face it runs on |
| `garage` | a door that lifts overhead | | nothing | nothing; `swing` names the face it lifts into |
| `fixed` | | glass that does not open | | |
| `high-level` | | a window set high in its wall, above the plan's cut, drawn dashed | | |

`hinge` and `swing` stay in the wall's terms (`start` is the end nearer the wall's start, `left`
the face its normal points at). An agent need not work them out: `grid_change_opening` takes
`opens_into` (a room, or `outside`) and `hinged` (`left` or `right`, standing in a room and
facing the door) seen from `seen_from`, else from the room it opens into, and rooms text takes
`opens into hall, hinged left` or `hinged right seen from bedroom`. Either turns them into
`hinge` and `swing` (`handingFromRooms` in `packages/floorplan/src/geometry/handing.ts`); the
schedule says them back in rooms.

`opens` is the part that opens: `width` along the wall and `height` from its foot (the opening's
height when left out), at the end the door hangs from (`hinge`), else at the wall's start. A
door with a part narrower than itself is a leaf beside a fixed glazed panel; a pair's part is
its main leaf; a window's is its casement, with fixed glass in the rest. The escape check
measures a window by its part, and a fixed window as opening nothing.

Each kind is drawn with its usual symbol in the plan, the sheet and the DXF (dashed what lies
above the cut or in the wall, on the DXF layer `GRID-OPENINGS-ABOVE`), and in 3D with its
frame, its leaves hung closed from the face of the wall it opens toward, and its glass, in the
views, the OBJ, the GLB and the IFC. The IFC types each door and window by its kind, size and
handing ([what the IFC holds](commands.md#what-the-ifc-holds-hnd-2)), and the schedules list
the kind, the part and the handing.

| Code | What it says |
|---|---|
| `opening/wide-single-leaf` | A door at least 1.5 m wide (`wideSingleLeaf`) states no kind, so it is checked as one swinging leaf that wide and drawn as Grid's guess, a pair or a sliding door (VEW-22): say its kind (lab EL-5: 176 of the lab's doors) |
| `opening/kind-not-for-type` | A kind its type does not take, such as a window that is a `garage`, or any kind on a doorless opening. It is drawn as one with no kind |
| `opening/part-too-large` | A part that opens wider or higher than the opening, or on a fixed window or a doorless opening. It is taken as the whole opening |
| `floor/not-checked-door-swings` | Not checked: the doors on a floor whose kind swings or folds and that state neither `hinge` nor `swing`. Each is drawn with a "?" on a sheet and its sweep is not checked |

## Named wall, door and window types, and finishes

A plan may hold a short list of named types in `types`, and a wall, a door or a window may name
the one it is (CNT-15, convention C24). A type fills what a part leaves out, so one change to the
type changes every part of it: "make every partition 120 mm" is one change, to the type.

```json
"types": {
  "walls": [
    { "id": "party", "name": "Party wall 250", "thickness": 0.25, "kind": "interior", "material": "Concrete" },
    { "id": "stud-100", "name": "Stud partition 100", "thickness": 0.1, "height": "floor", "kind": "partition", "material": "Plasterboard on timber studs" },
    { "id": "glass", "name": "Glass partition", "thickness": 0.05, "kind": "partition", "glazed": true, "material": "Laminated glass" }
  ],
  "doors": [{ "id": "D90", "name": "Internal door 900", "width": 0.9, "height": 2.1, "kind": "single", "material": "Oak" }],
  "windows": [{ "id": "W12", "name": "Casement 1200", "width": 1.2, "height": 1.2, "sill": 0.9 }],
  "defaults": { "walls": { "partition": "stud-100" }, "door": "D90" }
}
{ "id": "w-hall-bath", "start": [4, 0], "end": [4, 3], "wallType": "stud-100" }
{ "id": "door-bath", "wall": "w-hall-bath", "type": "door", "offset": 0.4, "doorType": "D90", "swing": "left", "hinge": "start" }
```

| Type | It holds | It fills on a part that names it |
|---|---|---|
| a wall type (`types.walls`) | `id`, `name`; any of `thickness`, `height` (metres, or `floor`), `kind`, `glazed`, `material` | `thickness`, `height`, `kind` |
| a door type (`types.doors`) | `id`, `name`; any of `width`, `height`, `kind` (C20), `opens`, `glazed`, `material` | `width`, `height`, `kind`, `opens` |
| a window type (`types.windows`) | the same, a window's kinds, and `sill` | `width`, `height`, `sill`, `kind`, `opens` |

- **A part names its type** in `wallType`, `doorType` (a door) or `windowType` (a window), by id. A
  value the part states itself wins: the type fills only what the part leaves out. So a door of
  the type that states its own width is still of the type, and a supplier's schedule lists it as
  a type apart. A dividing line takes no type.
- **The reading fills the part** before anything else reads it, and says what it filled in
  `typed`, which no file writes (a file that does is told it is not read) and no change writes
  back: the file keeps only what the part states. Every reader, the drawing, the checks, the
  areas and the exports, sees the filled values.
- **A wall type's height** is metres, or `floor`: as high as a wall on its floor that states none,
  the floor's stated height or the roof over it ([floor levels](#floor-levels-and-heights)). A
  type that states no height leaves its walls' heights as they are.
- **`defaults`** names the type a part takes when it names none: `walls` by the wall's kind (a
  wall that states no kind is read as `interior`), `door` and `window`. A part given its type by a
  default is written back naming none. A door or window that names no type and states every size
  its default type would fill (width, height and the sill when the type has one) takes no default
  type, so a schedule never lists it as one; one that names the type is of it, whatever it states. The `types` block, defaults and all, is the template an
  office keeps: copy it into a new plan, and every wall, door and window drawn takes the office's
  types.
- **Materials.** A type's `material` is the person's own word for what it is made of. Grid checks
  none. The IFC writes it as the type's one layer, and `Not stated` where no material is given,
  for a wall of no type too (lab AU3-4); [what the IFC holds](commands.md#what-the-ifc-holds-hnd-2).
  Layered build-ups are not held.
- **The kind** a wall type states is one of the wall kinds (`WallKindSchema`): `exterior`,
  `interior`, `partition` or CNT-6's `separating` (a party wall, or one to the common parts), so
  a party wall type gives its walls the kind the route and estimate checks read, and the walls
  are priced by their type, apart from partitions of the same thickness (lab AC-5).
- **A file in other units** has its types' lengths read in that unit too ([units](#units)).

A room or a zone may name its `finishes`, each by the person's own name: `floor`, `walls` (the
inside faces of its walls), `ceiling` and `skirting`. A zone's finish is its part of its room:
the room's finish covers the rest. Grid checks no finish; it measures each one
(`grid_schedule of=finishes`, `grid_takeoff`, [areas](areas.md#finishes-and-wall-types)).

```json
{ "id": "kitchen", "name": "Kitchen", "boundary": ["…"], "use": "kitchen", "partOf": "open-plan", "finishes": { "floor": "Porcelain tile", "walls": "Tiled splashback" } }
```

A finish follows the room or zone that names it, never the room's use. Two rooms that name
different finishes for one surface are merged (`grid_merge_rooms`) only as zones of one
open-plan room (`zones: true`), each keeping its own, so a kitchen's tiled floor stays the
kitchen's after a knock-through (lab AC-4); the merged room names the finishes the two share. A
plan read back as rooms text and written again keeps every part's type and every room's
finishes, and leaves to a part's type each value the text writes that the type gives the same. A
part typed by a default stays typed by it: the read-back and the writing name a type only on the
parts that named one, so a later change of the default still reaches every other part (WRT-70).

To change a type, give a part a type or make a type the default, use `grid_change_type` (`grid
edit type`); to set a room's finishes, `grid_rename_room` with `floor_finish`, `wall_finish`,
`ceiling_finish` and `skirting_finish` (`none` takes one out).

| Code | What it says |
|---|---|
| `type/unknown` | A wall, door or window names a type the plan's types do not hold, with the type most likely meant; or a default does. The part is read as naming no type |
| `type/duplicate-id` | Two types of one list have the same id. The first is read |
| `type/wrong-part` | A type on a part that takes none of that list: a dividing line naming a wall type, a window naming a door type. It is not read |

## Existing, demolished and new

A wall, a door, a window, a doorless opening and a room may state its `phase` (CNT-10): what the
work does to it. One plan then holds the building before the work and after it.

| `phase` | It stands | Drawn |
|---|---|---|
| `existing` | before the work, and stays | in a tone: grey in the technical look, a mid tone on screen |
| `demolished` | before the work, and is taken out | as a dashed outline where it stood, with no fill |
| `new` | after the work: the work builds it | filled: black in the technical look, as walls are on screen |

```json
{ "id": "wk", "start": [0, 3], "end": [5, 3], "thickness": 0.1, "kind": "interior", "phase": "demolished" }
{ "id": "d-bath-old", "wall": "wb", "type": "door", "offset": 1, "width": 0.7, "height": 2.1, "phase": "demolished" }
{ "id": "d-bath", "wall": "wb", "type": "door", "offset": 0.9, "width": 0.9, "height": 2.1, "phase": "new" }
```

The building before the work is its existing and demolished parts; after it, its existing and
new parts. A part that states no phase:

- in a plan that states no phase anywhere: the plan is read, drawn, measured, checked and
  exported exactly as before;
- an opening, in a plan that does: its wall's phase when its wall is demolished or new, so a
  door goes with its wall and is built with it; else as below;
- any other part of a plan that states a phase: existing, standing before and after the work;
- a part of a plan fitted out in a base (below): new, since the plan is the work.

What Grid does with each state:

- **Checks and measures.** The drawing check reads each state on its own: a widened door, its
  old opening demolished and a new one in the same place, is accepted, as is a wall rebuilt where
  one is demolished; neither is in the other's state. What the plan holds after the work is
  checked in full; of the state before it, only what is about a part to be demolished. An opening
  or a room that stands when its wall does not is left out of both (`opening/phase-wall`,
  `room/phase-wall`): a new door in a wall to be demolished, an existing room round a new wall.
  Every area, size, schedule, take-off, description and plan check is of the building after the
  work, and says so: `grid check` gives one line, `plan/read-after-work`, with the counts;
  `grid_areas` a note; `grid describe` a sentence. Two rooms knocked into one are both
  `demolished`, and the room they become is `new`.
- **Drawing.** Each phase as the table says, through every look, with a key. Sizes are of the
  building after the work: a demolished wall has none. The 3D view, the stills and the facades
  show the building after the work.
- **Exports.** The DXF puts each wall on its phase's layer, `GRID-WALLS-EXISTING`,
  `GRID-WALLS-NEW` (its fill on `GRID-WALLS-FILL-NEW`) or `GRID-WALLS-DEMOLISHED` (dashed), and
  each opening to be demolished, as its outline, on `GRID-OPENINGS-DEMOLISHED` (dashed); a profile
  may rename them (`walls-existing`, `walls-new`, `walls-demolished`, `wall-fill-new`,
  `openings-demolished`). The IFC writes every wall and opening, the demolished ones as they stood
  before the work, and the rooms after it, each element with a property set, `Grid_Phase`, whose
  `Phase` is `existing`, `demolished` or `new`. Room numbers count the rooms after the work.
- **The comparison.** `grid diff --since phase` (`grid_diff` with `since: "phase"`) compares the
  plan before its work with after it, by what stands where: what is removed is to be demolished,
  what is added is new, and a widened door is a door whose width changed. A door whose room the
  work replaces is no issue there; an old window the work leaves between two rooms is (CMD-31).
- **The cost.** `grid_takeoff` with `for: "change"` gives the work as three lists: demolish
  (walls by kind and thickness, doors and windows by size), make good (the floor where a wall
  stood, the wall faces where it met walls that stay, each opening filled in, less what a new one
  in the same place takes, and the reveals of new openings cut in walls that stay) and new (walls,
  doors and windows, the new rooms' floor by use). Each line has a key a rates file prices,
  `demolish:wall:interior:0.1`, `make_good:infill:exterior:0.3`, `new:door:0.9x2.1`; a shorter key
  covers longer ones, so `demolish` prices every demolition line.
- **Setting them.** No file needs editing by hand. `grid_start_works` (`grid edit start-works`)
  marks every wall, door, window and room that states no phase as `existing`; a door or window
  with none on a wall that is demolished or new is left to go with its wall. `grid_set_phase`
  (`grid edit phase`) marks parts by id, or rooms, each with the walls only it uses and the doors
  and windows in them; a wall another room still stands against is left, and named.
  `grid_phase_from` (`grid edit phase-from`) writes one plan from two plans with no phases, the
  building `before` and `after` the work, pairing parts by id: only in the first is demolished,
  only in the second new, the same in both existing, and a part that changed is new beside
  `<id>-before`, demolished. Fixtures, stairs and everything else are the second plan's.
- **Corrections.** To fix the survey rather than make work, pass `correction` (`--correction`) to
  a change of an opening or a wall, a side moved, a stretch, a mirror or turn, a merge, a split, a
  room or opening added, or a scan squared. The change is made in place and no part's phase
  changes; a part it adds states none, so it is existing (new on a wall that is new). A mirror or
  turn takes the whole plan, what is to be demolished too. Any other correction is worked out on
  the building after the work, leaves what is only to be demolished as it was, and says so.
- **Edits.** In a plan with phases a change is the work: what it adds is new; a door, window,
  wall or room it takes out of what stood before stays, demolished; a door or window it changes
  keeps its old self beside it as `<id>-before`, demolished, so widening a door is an old opening
  and a new one. The room edits (WRT-15) keep what stood before too: a wall made longer stays
  and each stretch added is new, `<id>-new`; a wall made shorter takes its new ends and the
  stretch cut off is kept as `<id>-before`, demolished; a wall moved off its line is new under its
  id and the wall it was is kept as `<id>-before`, demolished, with its doors and windows (a door
  left on it is new). A room that a change reshapes, or that would stand on a new wall, is new
  under its id, and the room it was is kept as `<id>-before`, demolished, round the walls as they
  stood; a room on the pieces of a wall cut where it stood keeps its shape and stays. A door whose
  place along its wall changes only because the wall's start moved is not new work. The answer
  lists what stays to be demolished and what is new, and the comparison by phase reads a room kept
  as `<id>-before` as the room it became. A curved wall a change moves is changed in place, and
  the answer says so under what it could not keep. `grid write` will not
  write rooms text over a plan with phases without `--replace` (rooms text holds no phase), and
  `grid tidy --apply` will not change one.

### A fit-out on a base plan

A plan may name the plan it is fitted out in, `base`, by its path from the project folder:

```json
{ "version": "1", "base": "shell.json",
  "walls": [{ "id": "p1", "start": [4, 0], "end": [4, 5], "thickness": 0.1, "kind": "partition" }],
  "rooms": [{ "id": "front", "name": "Reception", "boundary": ["s1", "p1", "s3", "s4"] }] }
```

The command and the tool server read the base as they read a plan, through the project's one
resolver: inside the project folder, never through a link out of it, never an address (CMD-15).
The base names no base of its own. Its walls and openings, as they stand after its own work, are
read into the plan as existing; its rooms are not, since the fit-out says what its rooms are. The
fit-out's rooms may rest on the base's walls; its own parts that state no phase are new. A part of
the fit-out with the id of a base wall or opening refuses the plan, naming the id.

The base is read-only. It is drawn as existing, measured and checked with the fit-out, and never
written into it: a change that would move, cut or take out a base wall or opening, or put an
opening in a base wall, is refused, naming them, and nothing is written. To change the shell,
change the base plan, and every fit-out on it reads the change.

A fit-out is written in rooms text by its first line, `base <plan>` (WRT-75): the rooms are
written by their inside faces as always, and a wall Grid works out whose room faces lie on the
faces of a base wall is not written: the room names the base's wall in its boundary instead, by
the base's id. `grid write` and `grid_write_rooms` read the base through the same resolver and
write `base` into the plan with only the fit-out's own walls, rooms and openings; a door or window
the text puts in a base wall is refused. `grid describe --as rooms` reads a fit-out back with its
`base` line, and that text writes the same fit-out again; rooms text that names another base, or
none, over a fit-out is refused unless `--replace` is given. `grid_start_fit_out` (`grid edit
fit-out --base <plan>`) starts one: a new plan naming the base, with the base's rooms as its own.

## Wall faults, each with its fix

A room's outline is made by crossing the lines of its walls, so where a wall ends does not
change it: a wall 1.5 m short of its corner leaves the room closed and measured as before. Grid
also sets each wall against its corners and against the other walls, and names what an agent's
slip leaves behind at the wall, with the change that would fix it. Each is a warning.

| Code | What it says |
|---|---|
| `wall/short` | At a corner of a room, one of its two walls stops short of where their lines cross: the gap, both points and the move that closes it |
| `wall/gap` | The pieces of one straight side of a room leave a gap between their ends, in whatever order they are listed. A gap that the body of a wall across the side closes, where one of the pieces ends in it (the corner of two outside walls at the end of a dividing line), is no gap |
| `wall/overrun` | A wall runs on past the last corner any room makes on it, and its end meets no other wall. A wall longer than one room, or a T-junction, is normal and gets nothing |
| `wall/duplicate` | Two walls, or two dividing lines, on one line lie on top of each other: the drawing and every export show that stretch twice |
| `wall/line-on-wall` | A dividing line lies on top of a solid wall, so that stretch is both open and solid |
| `room/wall-listed-twice` | A room names one wall twice in its wall list |
| `wall/crosses-room` | A wall runs across a room that does not list it, from one side to another, and the room can be split in two along it |
| `wall/stands-in-room` | Walls stand inside a room that does not list them and stop there: a stub, or a pod, a column or furniture drawn as walls. One line per room, with no fix: what they are is for the person to say |

Two walls reach each other when the end of one lies within half the thicker plus `gap` of the
other's line, so walls drawn to centre lines, to faces and 1 mm apart all meet. A fix is offered
only when it has been tried and every room it touches still has an outline; otherwise the line
says what to do instead. In the library, `wallFaults(plan)` gives each fault with an id
(`short:n:start`, `duplicate:copy`), the walls and rooms it is about, the distance, the message
and the fix as plain edits (`move-end`, `remove-wall`, `set-boundary`, `add-room`,
`move-opening`, `remove-opening`). `tidyPlan(plan, ids)` makes the fixes chosen, or every one
on offer when no ids are given, and looks for the faults again before each, so the faults it
fixed are gone afterwards. `applyWallEdits` makes a list of edits on a plan file as read and
keeps every other key in it.

## Inside and outside walls

Whether a wall faces outside is worked out from the rooms on its two sides, stretch by stretch
along it: where an edge of a room's outline runs along one face, that room is on that face. A
stretch with rooms on both faces stands inside; one with a room on one face only faces outside,
unless the walls enclose floor on the other face (a space no room claims is not the outside).
A face with no listed room tries the point just past it, so the walls of a pod marked `inside`
face the room around it. One wall can face an extension for part of its length and the outside
for the rest, without being cut in pieces.

The 2D drawing, the 3D scene, the DXF layers, the IFC `IsExternal` mark, the order a plan is
built in, and the route and escape checks all read this one answer. A wall stated `exterior`
stays an outside wall where rooms lie on both its sides (a courtyard, a balcony or a terrace
drawn as a room). Every other kind is worked out, because `interior` is also what a wall that
states no kind reads as. Where they disagree, one warning says so:

| Code | What it says |
|---|---|
| `wall/kind-differs` | A wall stated exterior with rooms on both sides, kept as an outside wall; or a wall stated a partition that faces outside, treated as an outside wall. With how long, and the rooms |

A wall stated `separating`, or one that states a common part or a neighbour `beyond` it, is
neither: it is a separating wall ([part of a larger building](#part-of-a-larger-building)).

In the library, `wallSides(index, wallId)` gives the stretches with the rooms on each face, the
worked-out exposure and the one used; `wallExposure(index, wallId)` gives the one used.

A wall that stands apart from the building is a garden or boundary wall (CNT-26). On a floor that
has rooms, a wall is loose when no room lists it, no room lies just past either face, it stands
in no outdoor space and it rises through no other floor. Loose walls that touch are one group,
and the group stands apart when it touches no wall of the building, touches it at one place only
and closes no ring of its own, or closes a ring round rooms. A boundary wall round the plot, a
garden wall standing apart and a wall run out from the house are; a low wall inside a room is
not, and nor are walls that close a space against the house at two places or more (a porch or a
landing not drawn as a room), which stay floor no room claims.
It stands in the open (`detached`) whatever kind it states, `exterior` included: it is no part
of the floor's outline, slab or roof, of any area or of the storey height, and a closed ring of
them encloses a garden, not floor. The drawing draws it in a partition's lighter fill and keys it
"Garden or boundary wall", and the take-off lists its metres on a run of their own, `garden`. It
is still drawn, exported and checked as the wall it is. A floor drawn as walls alone, with no
rooms yet, keeps every wall as the building's. In the library, `landscapeWalls(plan)` gives
their ids, and `wallSides` marks each `landscape`.

## A wall placed by its face

A wall's `start` and `end` are its centre line, and its thickness grows half each side of it. A
survey is taped to the faces of the walls, though, and nobody can tape inside one: the outside
walls' thickness is a guess, or unknown. So a wall may say that its line is one of its faces
(HND-11, lab WR-14), with `face`: `left` or `right`, as you walk from `start` to `end`. The wall's
body lies on the other side of the line, and its thickness, stated or not, grows away from it.

```json
{ "id": "ext-s", "start": [0, 0.16], "end": [7.35, 0.16], "face": "left", "kind": "exterior" }
```

Walls round a building listed counter-clockwise, as rooms list them, have the inside on their
left: `face: "left"` on each places them by the inside faces the tape ran along. The wall above
states no thickness, so it is drawn 0.2 m thick, and says so ([a value left out stays not
stated](#a-value-left-out-stays-not-stated)); state `0.4` later, or guess it 8 cm thicker, and the
building grows outward while every room keeps the inside sizes taped. Placed on its centre line,
the same guess would take 4 cm off each room beside it.

Grid reads the wall on its centre line, so every drawing, measure, check and export reads it as
any other wall. Its edits keep the face: a wall moved, cut in two or stretched stays placed by
the same face, on that face's line, and a mirrored plan turns each such wall to its other face,
so the inside stays inside. `grid tidy` does the same. Moving a side of a room carries the walls
placed by their faces that end on it, as it carries walls on their centre lines (WRT-38).
`grid_change_wall` (`grid edit wall`) sets one wall's thickness: a wall placed by its face keeps
that face and grows or shrinks on its other side, any other wall keeps its centre line, and a wall
that ended in a thinner wall is carried to its new centre line, so it stays joined. The answer of
every change, its areas and its taped lengths among them, is measured on the plan as the written
file will be read, so it is what `grid check` gives afterwards. A `face` Grid cannot read leaves the wall
out, rather than draw it half its thickness off. A dividing line has no thickness, so its face is
its line. A [curved wall](#a-curved-wall) placed by its face has its line on that
face's circle, round the same centre: Grid moves each end along its radius to the curve's middle,
and writes it back the same way, so a bow-fronted room taped on its inside faces reads as taped
however often Grid writes it (CNT-32). Rooms text writes rooms by their inside sizes already ([rooms-first.md](rooms-first.md)):
there a thicker wall moves the rooms apart and leaves each room's size as written. A plan that
places walls by their faces is read back as rooms text in Grid's own terms, so nothing is lost.

## Lengths taped on site

What was taped is kept beside the drawing, in `taped` (HND-11, lab WR-14): the checks a survey
brings with it. Nothing is drawn or placed from a taped length; every run sets each one against
the drawing.

```json
"taped": [
  { "id": "t1", "room": "bedroom", "wall": "ext-s", "length": 3.47 },
  { "room": "bedroom", "from": ["ext-w", "ext-s"], "to": ["bed-hall", "row"], "length": 4.69, "tolerance": 0.02 }
]
```

| Field | What it states |
|---|---|
| `room` | The room it was taped in, by id |
| `wall` | The room's side along this wall, corner to corner on its inside face: every edge of the room's outline on that face, end to end |
| `from`, `to` | Instead of `wall`: two corners of the room, each named by the two walls that meet there, for a diagonal or any corner to corner |
| `length` | The length taped, in metres |
| `tolerance` | Optional: how far the drawing may be from it and still agree. Unstated, `tapedAgree` (0.01 m, [tolerances.md](tolerances.md)) |
| `id` | Optional: the person's own reference for it |

Both are measured on the room's outline along the inside faces of its walls, the outline its area
is measured on. A tape was run on the building as surveyed, so a plan with [phases](#existing-demolished-and-new) is read in its existing state, never the one the work proposes: the check and every change's answer give the same rows, and a length taped in a room that is new is not measured. Along a [curved wall](#a-curved-wall), a side is the outline round the curve, its
own stretch of the circle only, and a corner where a straight wall meets the curve, or two curves
meet, is the outline's corner where their inside faces cross (CNT-32). Where the same two walls
meet at two corners of the room, as a half-round bay closed by one straight wall does, the order
they are named in tells the corners apart: going round the room counter-clockwise, `["W", "S"]` is
the corner where wall `W` gives way to wall `S`, and `["S", "W"]` the other. `grid check` and `grid_check` print the table after the notes, and every change
to the plan (the edit tools, `grid edit`, `grid write`, `grid_write_rooms`) prints it in its
answer, the ones that differ first ([the result contract](result-contract.md#taped-against-drawn)):

```text
Taped against drawn (4; 1 differs): each length taped on site, set against the drawing's inside faces.
  What was taped                                                taped    drawn     off
  Bedroom, the side along wall "ext-s"                        3.470 m  3.470 m   0.000  agrees (within 0.010 m)
  Bedroom, the side along wall "ext-w"                        3.200 m  3.200 m   0.000  agrees (within 0.010 m)
  Hall, the side along wall "ext-s"                           1.400 m  1.200 m  -0.200  differs (within 0.010 m)
  Bedroom, corner "ext-w"/"ext-s" to corner "bed-hall"/"row"  4.690 m  4.684 m  -0.006  agrees (within 0.010 m)
```

| Code | What it says |
|---|---|
| `room/taped-differs` | A length taped and the same length drawn are further apart than its tolerance: both figures, and by how much the drawing is longer or shorter |
| `plan/taped-not-measured` | A taped length that names a room or a wall the plan does not have, a wall that is not one of the room's, two walls that make no corner of it, or a room that cannot be drawn |

## A trace image under the plan

A scan, a photo, a sketch or a page of a PDF can be traced over (HND-10, C31). The plan names it
in `referenceImage`, says where it lies and how large it is, and Grid draws it under that floor's
plan in every picture an agent gets: `grid_view`, `grid draw` and the preview, its picture and
its page's own drawing. It is in no measure, check, export or sheet. `grid_place_trace` and
`grid edit trace` (VEW-67) write it without editing the file by hand: the picture, its floor and
opacity, its corner and turn, and its scale stated, set from two points on it and their length
(a scale bar's two ends and the length marked on it), or with its corner and turn from two of its
pixels pinned to the two points of the plan they show.

```json
"referenceImage": {
  "path": "assets/ground-floor-scan.png",
  "floor": "ground",
  "at": [-1.2, 9.4],
  "rotation": 0,
  "calibration": { "from": [212, 148], "to": [1012, 148], "length": 8.4 },
  "opacity": 0.5
}
```

| Field | What it states |
|---|---|
| `path` | The picture, from the project folder: a relative path that stays inside it and ends in `.png`, `.jpg`, `.jpeg` or `.pdf` |
| `page` | Optional, for a PDF: the page traced, from 1. Unstated, the first. The page's largest raster picture is traced, in its own pixels: a scanned sheet's scan. A page drawn only in lines and text has none, and is said not to be drawn |
| `floor` | Optional: the floor it lies under. Unstated, the ground floor, the one a picture draws when none is asked for |
| `at` | Optional: the point of the plan, in metres, that the picture's top-left corner lies on. Unstated, `[0, 0]` |
| `rotation` | Optional: its turn about that corner, in degrees counter-clockwise. Unstated, 0 |
| `calibration` | Optional: its scale, set from two points on it and the length between them: `from` and `to` in the picture's own pixels, from its top-left corner with y down, and `length`, how far apart they are on the building in metres |
| `scale` | Optional: its scale stated outright, in metres per pixel. Never with `calibration` |
| `opacity` | How strongly it is drawn, 0 to 1. Unstated, 0.4 |

The picture's pixel (u, v) lies on the plan at `at + turn(rotation)(u × scale, −v × scale)`: its
pixels run down the page, the plan's y runs up. Pixels are counted on the picture as it is shown:
a phone's photo stored on its side with an EXIF turn is counted turned, as any image viewer shows it. A trace image with neither `calibration` nor
`scale` has no scale: it is drawn at one centimetre a pixel (`traceUnscaled`,
[tolerances.md](tolerances.md)) and every answer says it is not to scale. To scale a photo, pick
two points on it whose distance on the building you know, in the same plane as what you trace
(a photo of a wall at an angle has no one scale). Two points that are the same, a length of 0,
or a scale beside a calibration are refused; the reader leaves that one field out and keeps the
image ([a fault stays where it is](#a-fault-stays-where-it-is)).

It is drawn over the rooms' fills and under every line of the plan, so a wall traced off its line
shows by eye, and the view frames the picture with the drawing: on a floor with nothing drawn
yet, the picture alone. `grid_view`'s answer and `grid draw`'s standard error say where it lies,
its scale and where it came from, and how to turn a pixel into a point of the plan:

```text
The trace image "assets/ground-floor-scan.png", 1600 × 1200 px, is drawn under the plan, 1 px = 0.0105 m, set from two points on it 800 px apart that are 8.4 m apart on the building. Its top-left corner is at (-1.2, 9.4) m, and its pixel (u, v) lies at x = -1.2 + 0.0105·u, y = 9.4 − 0.0105·v.
```

A plan may come from someone else, so the path is held to the project folder: another folder,
`..`, a web address, a script (`javascript:`), an absolute path, a link out of the folder or an
ending that is not a picture is never followed, in any command or tool
([the project folder](commands.md#the-project-folder)). The plan is read without the trace image
(MSG-20): `grid check` and `grid_check` give one `plan/trace-left-out` line with the path, the
folder and why, and so does a picture that is not in the folder yet. The plan file keeps
`referenceImage` as written. A path that is fine but leads to nothing yet, to a file that is not
a PNG or a JPEG whatever its ending, to a file over 32 MB or to a picture more than 16,384 pixels
along a side is not drawn, and the picture's answer says which. The
picture is read through the project's own files and handed to the drawing as the picture
itself; the drawing reads no file and fetches nothing.

A hand sketch with its sizes written on is best written rooms first ([rooms-first.md](rooms-first.md)),
from the sketch's numbers, with the sketch as the trace image to check the result by eye. Mark
the parts whose sizes the sketch gave as `given` ([where a value came from](#where-a-value-came-from))
and anything you took from the picture alone as `assumed`, for the person to confirm.

## North, front and where the building is

The drawing's sides have names of their own: its top is called north, as rooms text, the
anchors, `grid describe` and the edits call it. A plan may also say how it sits on the earth
(CNT-3). All four fields are optional; a plan that states none reads, draws and exports as
before, with no north and y up the page.

```json
{ "north": 30, "yAxis": "up", "front": { "opening": "entry" }, "site": { "origin": [0, 0], "latitude": 40.4168, "longitude": -3.7038, "elevation": 650 } }
```

| Field | What it states |
|---|---|
| `north` | Where north lies on the drawing, in degrees counter-clockwise from its top (+y), as a north symbol's `turn` is: 0 is up the drawing, 90 to the left (-x), -90 or 270 to the right (+x). Rooms text writes it as `north 30`, `north 30 clockwise` or `north up-left`, and `grid_set_site` as `north` or `north_points` (CNT-41) |
| `yAxis` | Which way +y runs on the page with +x to the right: `up`, as Grid draws every plan, or `down`, as a screen or an image's pixels run. Unstated, it is `up` |
| `front` | The part whose outside face is the front of the building: `wall`, a wall's id, or `opening`, an opening's id such as the front door, by the wall it is in. One of the two |
| `site` | Where the building sits: `origin`, a point of the plan in metres, and, if known, where that point is on the earth: `latitude` and `longitude` in degrees (north and east positive, given together) and `elevation`, metres above sea level. Each is optional, but nothing is placed on the earth without `origin`; a field Grid does not hold is named and read without. A plan kept at survey coordinates states a point near the building as `origin`, and is measured and exported from it ([survey coordinates at a stored origin](#survey-coordinates-at-a-stored-origin)). `site` also holds `ground`, the level of the ground outside ([slabs, roofs, ceilings and the ground](#slabs-roofs-ceilings-and-the-ground)), which needs no `origin`. `country` is [the place](#the-place) the figure checks are for, and `boundary`, `streets`, `setbacks` and `things` are [the plot](#the-plot-its-boundary-set-backs-and-what-is-on-it) |

North is drawn and written where the plan states it:

- **The drawing.** Each floor's plan, in `grid draw`, `grid_view` and the sheet, shows a north
  arrow in the top-right corner of its view, turned to the stated north: the north symbol of
  [the writing on the drawing](#writing-on-the-drawing-and-the-sketch-layer), on a disc. A
  floor that places a north symbol of its own gets no second arrow, and a north symbol that
  states no `turn` points to the stated north. The 3D views name their sides by the drawing,
  as before.
- **The IFC file.** The model's `TrueNorth` is the stated north, as a direction in the plan's
  x and y. A plan that states none gets none: `TrueNorth` is left empty, where Grid wrote +y
  for every plan before. A program that reads IFC takes an empty `TrueNorth` as +y, so the
  model lands the same; the file only stops claiming a north it was never told. A plan with a
  `site` puts the IFC site's origin on that point, with its latitude, longitude and elevation
  (`RefLatitude`, `RefLongitude`, `RefElevation`); the building keeps the plan's coordinates.
- **Which way the rooms face.** `grid_measure` with `what=facing` says which way each outside
  wall, each opening in one and each room behind them faces: the normal of the wall's outside
  face, the one with no room on it ([inside and outside walls](#inside-and-outside-walls)),
  turned into a compass point by the stated north. A room faces each way its outside walls do,
  longest first, and lists the ways its windows face. So "which rooms face east" has an answer.
  For a 6 × 4 m house of two rooms, the living room to the west and the kitchen to the east,
  with `"north": 30` and the front door named as its front:

  ```text
  North, as the plan states it: 30° counter-clockwise from the top of the drawing (north 30).
  Rooms by the way their outside walls face:
    north-east: "Living" (living, window), "Kitchen" (kitchen)
    south-east: "Kitchen" (kitchen, window)
    south-west: "Living" (living), "Kitchen" (kitchen)
    north-west: "Living" (living)
  The front, opening "entry", faces south-west (bearing 210°).
  ```

  A plan that states no north is answered with north taken as the top of the drawing, and the
  answer says first that this is not known to be north. `grid describe` adds the same in a few
  lines, with which real way each side of the drawing faces, for a plan that states its north
  or its front. `grid_measure` with `what=sun` lists each room's window walls, the way each faces,
  the window area against the floor area and the depth from each wall, as a table of geometry
  ([tool-server.md](tool-server.md#which-rooms-get-the-sun-a-table-of-geometry)).

A rotation cannot undo a mirror: a plan drawn with its y running down the page is the
building's mirror image, and no north makes it right. So the plan says which way its y runs.
Grid draws and exports the coordinates as the file holds them, with y up, and `grid check`
says that the drawings are mirrored (`plan/y-down`); the ways the rooms face are read the right
way round.

`grid_mirror` makes a new design, the old one mirrored. The stated north is mirrored with it,
to minus itself, so the swap it promises is the real one: left to right, what faced east faces
west, whichever way the drawing is turned. The site's origin, its boundary and its things are
mirrored with the walls (each edge keeps its number), the
front stays the part it names, and `yAxis` is kept.

`grid_mirror` with `turn` turns the plan a quarter or half round about the middle of its walls
(WRT-4): 90 degrees is a quarter counter-clockwise on the drawing as Grid draws it, with y up,
the way `north` is measured; 270 or -90 a quarter clockwise. Every room keeps its size and its
walls, every door its swing, and the fixtures and the site's origin turn with the walls. The
stated north is kept: the building turns on its site, so what faced south faces east after a
quarter counter-clockwise. `yAxis` is kept too, so on a page whose y runs down the same turn
looks clockwise, and the answer says so.

| Code | What it says |
|---|---|
| `plan/front-not-said` | The front names a part the plan does not have, or a wall that does not face outside: no front is said |
| `plan/y-down` | The plan says its y runs down the page, so every drawing and export shows the building mirrored |

## Survey coordinates at a stored origin

A survey or a map gives coordinates in the millions of metres: 432000, 4580000. A plan may keep
them as they are and state a point near the building as `site.origin` (HND-11, lab MS-12):

```json
{ "site": { "origin": [432000, 4580000] }, "walls": [{ "id": "s", "start": [432000, 4580000], "end": [432009.2, 4580000], … }] }
```

- **The check** measures how far the plan reaches from that point (`farFromOrigin`, 500 m), so a
  building at survey coordinates with its origin stated raises no `plan/far-from-origin`, which
  asks whether a unit slipped. Without an origin, or with one far from the building, it is asked.
- **The exports** write the geometry near zero and keep the offset: a plan that reaches further
  than 500 m from (0, 0) is written from `site.origin`, or, with none stated, from the middle of
  its walls in whole steps of 500 m (HND-2). The IFC puts its site on that point and its elements
  from it, so a BIM tool reads small numbers and places them where they are. A GLB holds its
  points as 32-bit numbers, about seven digits, so the building is built near zero and the file's
  root node (`building`, or the one floor asked for, VEW-64) is moved by the offset, with
  `asset.extras.gridOrigin`: every point within 1 mm of the plan. The DXF and OBJ write their numbers as text, to the micrometre,
  and keep the survey coordinates as they are. A plan near (0, 0) exports as before.

Survey coordinates still cost the drawing digits: every check and measure runs on the plan's own
numbers, and at 4,580 km from (0, 0) an area can come out a few tenths of a square centimetre off
(HND-2's 4.8003 m² for 4.8). A plan drawn near (0, 0) avoids that, and says where it is on the
earth with `site.origin`, `latitude` and `longitude` (above). LVL-4's `site.ground` and COD-3's
`site.country` need no origin.

## The plot: its boundary, set-backs and what is on it

The site may hold the plot as well as where the building is (BRF-3): its boundary, which edges
are on a street, the set-backs the person asked for, and what stands on the ground outside. All
four are optional and never defaulted, so a plan that states none reads as before.

```json
"site": {
  "boundary": [[0, 0], [15, 0], [15, 30], [0, 30]],
  "streets": [1],
  "setbacks": [{ "from": "all", "distance": 3, "source": "given" }, { "from": "street", "distance": 5 }],
  "things": [
    { "id": "fence", "kind": "fence", "points": [[0, 0], [15, 0], [15, 30], [0, 30], [0, 0]], "height": 1.8 },
    { "id": "oak", "kind": "tree", "at": [3, 4], "canopy": 5 },
    { "id": "pool", "kind": "pool", "points": [[1, 21], [5, 21], [5, 29], [1, 29]] }
  ]
}
```

| Field | What it states |
|---|---|
| `boundary` | The plot's corners, in plan metres, in order round it, either way round. Edge 1 runs from the first point to the second, and the last edge back to the first point; a last point written on the first again closes it and adds no edge. Three corners at least |
| `streets` | The edges on a street, by number |
| `setbacks` | The set-backs the person asked for: each `from` every edge (`all`), the street edges (`street`) or one edge by its number, with its `distance` in metres and, if known, its `source`: `given` by the person, or `assumed` for them to confirm. An edge takes the one asked for it, else the street's when it is on the street, else the one for every edge. One set-back for each `from` |
| `things` | What is on the site, each with an `id` and a `kind`, and a `label` if wanted (below) |

The set-backs are the person's own figures, never a code's: Grid compares the drawing with them,
applies no figure of its own, and never says a distance is enough. A street or a set-back that
names an edge the boundary does not have, a second set-back from the same edge, or one from the
street with no street edge, is left out alone, and `grid check` says so (`plan/value-left-out`).

None of it needs the file written by hand (CNT-41). Rooms text writes the plot in lines of its own
(`plot 15 x 30 at 0,0`, `street south`, `setback all 3`, `site tree oak at 3,4 canopy 5`; see
[rooms first](rooms-first.md#site)); `grid_set_site` sets the boundary, streets, set-backs, north
and where the building is, and `grid_change_site` adds, moves, resizes and removes the site's
things ([the tool server](tool-server.md#the-plot-distances-to-the-boundary-and-the-coverage)).

Each of the site's things has a kind of its own: never a wall, a room or a fixture, so it adds no
wall, no area, no note and no storey height, and the roof stays where the walls put it.

| Kind | Fields |
|---|---|
| `fence` | `points`, two or more, along it; `height` if known |
| `gate` | `points`, its two posts |
| `path` | `points`, two or more, along its middle, and its `width` |
| `paving` | `points`, three or more, round it |
| `pool` | `points`, three or more, round its edge |
| `tree` | `at`, its trunk; `canopy`, across its crown, and `height` if known |

The site is the ground: it is drawn on the ground floor's plan, in every look, in its own style:
the boundary in a long dash and a dot, its street edges heavier, paving and paths a pale fill, a
pool its water, a tree its crown, a fence a fine line and a gate its posts, all under the building.
The view frames the whole plot. The 3D views and the exports do not show it yet; `grid check`
says once that the site's things are drawn only (`plan/site-things-drawn-only`).

Grid measures the building against the plot from its outside face: the outer faces of the walls
of every floor at or above the ground floor, joined into one shape seen from above. A basement is
under the ground and is left out; an upper floor that reaches out past the one below counts where
it reaches; nothing outside the walls, such as eaves or steps, is drawn to measure.

- **Each edge.** The least distance from the building to the edge, as a tape between the two
  nearest points measures it. A building nearer an edge than the set-back asked for, by more than
  `setbackShort` (0.005 m), is a finding: "The building is 1.00 m from the east boundary; you
  asked for 3.00 m" (`plan/setback-short`). One reaching past an edge, by more than
  `pastBoundary`, is "The building reaches 0.50 m over the east boundary, out of the plot"
  (`plan/over-boundary`). An edge is named by the way it faces out of the plot, by the plan's
  north (the top of the drawing when it states none, and the answer says so), with its number when
  two edges face one way.
- **Each face.** The distance from each face of the building to the edge of the boundary in
  front of it, square to the face.
- **The plot coverage.** The part of the building's shape inside the boundary against the
  boundary's area: 90 m² on 450 m² is 20%. Open outdoor space is left out of the shape and given
  as a second figure beside it.

`grid_measure` with `what=site` answers with all three
([tool-server.md](tool-server.md#the-plot-distances-to-the-boundary-and-the-coverage)), and
`grid describe` with the plot's area, its coverage and the edge the building comes nearest.

| Code | What it says |
|---|---|
| `plan/setback-short` | The building is nearer an edge than the set-back the person asked for, with both figures |
| `plan/over-boundary` | The building reaches past an edge of the boundary, out of the plot |
| `plan/boundary-crosses` | The boundary crosses itself or encloses no ground: nothing is measured from it |
| `plan/not-checked-boundary` | The building has no outline to measure from, so no distance was measured |
| `plan/site-things-drawn-only` | The site's things are drawn only, never measured or checked |

## The place

The figure checks apply figures from building codes, and a figure holds only where its code
does. So the plan says where it will be built, in `site.country` (COD-3):

```json
{ "site": { "country": "United States" } }
```

The place is a country's name or its two- or three-letter code (ISO 3166-1), as Grid's own list
has it (`packages/floorplan/src/types/places.ts`): every country and territory with a code, its
short English name, and a few other names people use, such as `USA`, `United States of America`,
`UK`, `Great Britain`, `Holland` or `Ivory Coast`. Capitals, accents, dots and the spaces round
it do not matter: `US`, `usa`, ` United States ` and `U.S.A.` are one place. A name that could
mean two places (`Congo`, `Korea`) and a part of a country (`England`) are not on the list:
write the code. It is kept as written, and every report names it by Grid's name for it, never
by the text in the file. Anything else is not a place: the plan is read without it, the rest of
the `site` kept, and `grid check` says so with a `plan/value-left-out` line at `site.country`
that names the field and never repeats the text.

- **The US.** The figure checks run on the figures carried here, from US model codes.
- **Another place.** No US figure is applied; `grid check` says which checks did not run for
  want of figures for the place.
- **No place stated.** No figure is applied, and the report says so on its first line after the
  label.

`grid check --country` and `grid_check`'s `country` name another place for one check, in place
of the plan's; the report says which was used ("from the plan", "from --country"). `grid write`
keeps `site` as the file has it, so rooms text, which holds the walls, rooms and openings, loses
nothing of the place. The sheet does not print it.

## Where a value came from

A plan may say where its values came from, and how sure each is (WRT-6). It says so in `marks`,
one list beside the parts, so no number becomes an object and no part changes shape: a plan with
no marks reads exactly as before.

```json
"marks": [
  { "part": "wall", "id": "s", "source": "scanned", "tolerance": 0.02 },
  { "part": "wall", "id": "w1", "value": "height", "source": "assumed" },
  { "part": "room", "id": "bed2", "value": "use", "source": "given" }
]
```

| Field | What it states |
|---|---|
| `part` | `wall`, `room`, `opening`, `floor` or `item` |
| `id` | The part's id |
| `value` | Optional: the one value the mark is about. A wall's `start`, `end`, `thickness`, `height` or `kind`; a room's `name`, `use`, `height` or `floorOffset`; an opening's `type`, `offset`, `width`, `height`, `sill`, `hinge` or `swing`; a floor's `name`, `level`, `elevation`, `height` or `slab`; a fixture's `kind`, `at`, `size`, `height` or `turn`. Left out, the mark is about the whole part |
| `source` | `given` (by the person), `measured` (taped or lasered), `scanned` (from a capture of the building) or `assumed` (by whoever wrote the plan) |
| `tolerance` | Optional: how sure, in metres, give or take, on each length the mark covers. Only on a whole part or a length, never on a word such as a kind or a use |

A mark on a value wins over a mark on its part; of two marks on the same value, the first is read.
A part no mark names says nothing about where it came from: it is not taken as given.
These marks are part of the plan. A note of `grid check` the person sets aside as seen is kept
apart, in `plan.seen.json` beside the plan ([a note set aside as seen](tool-server.md#a-note-set-aside-as-seen)).

- **Assumed.** Whatever the plan marks assumed is drawn in its own style in every look (a dashed
  line in the look's warning colour round the wall, room or fixture, or across the opening; the
  key says "Assumed, to confirm with the person") and listed by `grid check` and `grid_check`
  under "To confirm", one `plan/value-assumed` line each, of the kind `to-confirm`. When the
  person confirms a value, mark it `given` or `measured`, or take the mark out.
- **Scanned or measured, with a tolerance.** `grid_areas` gives each room whose walls are marked
  its give or take: "from a scan, about ± 1.6% (± 0.20 m²)". It is each side of the room times
  its wall's tolerance, added up, over the area: the most the area moves if every marked face
  moves its full tolerance one way. A scanned wall with no tolerance gives "how sure is not
  stated", never a figure. The floor and plan totals add up their rooms' the same way.
- **Squaring a scan** is a step of its own: `grid_square_scan`, or `grid edit square`. It turns
  each wall marked scanned (every wall with `all`) that is within about 3 degrees of the plan's
  main directions (`squareWithin`, see [tolerances.md](tolerances.md)) onto them, about its
  middle, puts each corner back where the new lines cross, and answers with how far each wall
  turned and how far its ends moved. A wall further off is left as it is and named. The marks
  stay.
- **Written from a scan.** `grid write --scan` marks every part it draws `scanned` and each
  value it assumed `assumed` (an outside wall's thickness, a fixture's turn), and keeps the scan
  beside the plan in `plan.scan.json`, not in the plan ([a plan from a phone room scan](commands.md#a-plan-from-a-phone-room-scan-grid-write---scan)).

| Code | What it says |
|---|---|
| `plan/value-assumed` | A value, or a whole part, the plan marks assumed: for the person to confirm. Listed last, under "To confirm" |
| `plan/mark-no-part` | A mark names a part the plan does not have, so it is not read: a part renamed or taken out since |

### A value left out stays not stated

A wall may leave out its thickness, height and kind. Grid draws and measures it with its floor's
`height`, or 2.7 m high, 0.2 m thick and `interior`, but the reading keeps that the file stated
none (lab AU3-6). `grid describe` says "wall height not stated (drawn 2.7 m high)", never "walls 2.7 m high";
`grid describe --as rooms` writes no height for such walls; `grid write` writes a wall the rooms
text gives no height with none, so its floor's height or the default reaches it when the plan is
read; and Grid's edits never write a filled-in value into a file that stated none: a wall cut in
two, or a new wall beside walls with no stated height, states none either. A wall that takes its
floor's height states none of its own, so the height is said once, on the floor.

## Saved views, and the camera record

Every 3D picture Grid takes, in `grid_view`, `grid draw --view` and the app's 3D view when it is
handed one, comes from one camera record (VEW-3, `cameraRecord` in
`packages/floorplan/src/geometry/camera.ts`). A plan may keep cameras by name in `views`, saved
with `grid_save_view`; called up again (`grid_view view=…`, `grid draw --view …`) a view gives
the same record, digit for digit, while the plan keeps what it was taken of. A plan with no
`views` reads as before.

A camera is set by six things. Grid works the rest out from them, and reads only these when a
record is sent back or a view is called up:

| Field | What it sets |
|---|---|
| `target` | What the camera is pointed at: `point`, `[x, y, z]` in metres, and `room`, the room it is for (left out for the building as a whole). Grid points a camera at a room at the middle of its floor, half way up its storey |
| `bearing` | The compass bearing from the target to the camera, in degrees clockwise. With `bearingFrom` `north` it is read from the north the plan states, which the view keeps as `north` (degrees counter-clockwise from the top of the drawing, as the plan's `north`); with `plan up`, the plan states no north and bearing 0 is the top of the drawing. A view saved before the plan's north changed keeps its place, and is given back with its bearing from the north stated now |
| `tilt` | Degrees the camera looks down at the target, from level; below 0 it looks up. At most 89 either way (`cameraTilt`) |
| `distance` | Metres from the camera to the target, at least 0.1 (`cameraClosest`) |
| `lens` | `focalLength` in millimetres, 8 to 800 (`lensShortest`, `lensLongest`), on `sensor` `{ "width": 36, "height": 24 }` |
| `cut` | The floor shown cut away: it and the floors below it are drawn, nothing above it. Left out, the whole building |

Then, worked out and written for other programs, with no say in the camera:

| Field | What it is |
|---|---|
| `floors` | The floors drawn, lowest first |
| `position`, `direction`, `up` | The camera as the open BCF format writes a perspective camera: where it stands, the unit direction it looks and its unit up, with no roll, in the plan's metres: x and y as the plan's, z up from the ground floor's floor level as the 3D model stands its floors (a plan of one floor stands it at 0) |
| `fieldOfView` | BCF's field of view: the vertical angle, in degrees, of the lens on its sensor |
| `aspectRatio` | The picture's width over its height: 1.5, as the sensor and Grid's 1200 by 800 pictures are |

```json
"views": [
  { "name": "Garden corner", "target": { "room": "living", "point": [6.9625, 5.0125, 1.3] },
    "bearing": 200, "bearingFrom": "plan up", "tilt": 25, "distance": 11.121147,
    "lens": { "focalLength": 28.970563, "sensor": { "width": 36, "height": 24 } },
    "floors": ["ground"], "position": [3.515217, -4.458833, 6], "direction": [0.309976, 0.851651, -0.422618],
    "up": [0.144544, 0.397131, 0.906308], "fieldOfView": 45, "aspectRatio": 1.5 }
]
```

The record an answer carries adds what the plan says about the camera now: `eyeHeight`, metres
from `floor`'s floor level up to the camera (the target room's floor, else the floor cut away,
else the ground floor), and `standingIn`, the room the camera stands in, or `outside any room`
when it stands in none: outside the walls, inside a wall, above a storey's height or under its
floor (lab S-16). Every number is rounded to a millionth.

A view's name follows the plan's text rule, and names a view, never a person: it travels with the
plan file. When a view cannot be read (a tilt past 89 degrees, a lens of 2 mm), the plan's `views`
are left out as a value that cannot be read (`plan/value-left-out`, [A fault stays where it
is](#a-fault-stays-where-it-is)), and the rest of the plan is read.
`grid_mirror` mirrors each saved view with the plan; the other changes leave them where they are,
so a view of a room that moves keeps pointing where the room was. The sheet does not draw them
(`coverage.ts`): it takes its own pictures.

## What needs to be accessible

A plan may say which rooms and routes need to be accessible, in `accessible` (CNT-17, C14):

```json
"accessible": { "rooms": ["bath", "bed1"], "routes": [{ "to": "kitchen" }, { "from": "bed1", "to": "bath" }] }
```

| Field | What it states |
|---|---|
| `rooms` | Rooms that need to be accessible, by id: each is measured, and the way in to it from the entrance |
| `routes` | Ways that need to be accessible: `to` a room, and `from` a room or, left out, from the entrance (the front door the plan names, else its doors to the outside on the ground floor) |

It is a mark of what is needed, never a finding. `grid_measure what=access` measures what it
marks, as numbers ([the tool server](tool-server.md#accessibility-measurements-as-numbers)):
each door's hole and clear width, each corridor's narrowest point, each room's turning space and
the steps on the way in with their heights, set only against the person's own figures from the
brief. With no mark it measures every room, and says so. An id the mark names that is no room
is said in that answer and not measured; the plan is never refused for it. A mark that cannot be
read is left out with a line (`plan/value-left-out`) and the rest of the plan is kept.

`grid check` gives a plan that marks anything one line, `plan/not-checked-access`: what is
marked was not checked, as Grid holds no figure for it that a named person has confirmed. No
line says a room, a route or the plan is accessible. The sheet draws no mark. Grid's edits do
not carry the mark yet: a room merged or split away is named in the answer as no room.

## People are kept out of the plan

A plan travels. Room names and ids go into every export and sheet: the DXF writes each room's
name, the IFC its name and id, OBJ and GLB its id, and the sheet its name (its `check` layout its
id too). Whoever is handed the plan file reads both. So a room is named for what it is
(`Office 2`, `bed1`), never for a person, in its name or its id. The same holds for a floor's
name and a fixture's label.

Who sits where is kept in a file of its own beside the plan, named after it:
`plan.occupancy.json` beside `plan.json`. The plan knows nothing of it, and no export, sheet or
tool of the tool server reads it.

```json
{
  "version": "1",
  "seats": [
    { "room": "bedroom", "occupants": ["A. Person"] },
    { "room": "office", "desk": "Desk 2", "occupants": ["B. Person", "C. Person"] }
  ]
}
```

| Field | What it states |
|---|---|
| `room` | The id of a room of the plan. The seat is linked to it |
| `desk` | Optional: a desk in that room, by a label of this file's own. The plan has no desks: Grid keeps fixtures now and furniture later |
| `occupants` | The people at that seat, at most 100 |

Ids, desk labels and names follow the plan's text rule: an id at most 64 characters, a label or
name 120, each one line. A file that is wrong is refused naming the place (`seats[2].occupants[0]`)
and never the text, which is a person's name. `grid occupancy` lists who sits where by room name
and names any seat whose room the plan no longer has ([commands.md](commands.md#who-sits-where-grid-occupancy)).
Keep the file out of what you hand over: an export or a sheet never needs it.

## How the format changes

The plan format is version 1, and a change to it keeps every plan written before it reading and
drawing as it did:

- A new field is optional and never defaulted. A plan that leaves it out reads exactly as before,
  and a plan written back gains no key it did not state.
- A new field is named in the reading's list of the fields each part may hold, so a field it
  does not know is still named (`plan/unknown-field`), and its text is held to the limits in
  [What a plan file may hold](#what-a-plan-file-may-hold).
- A rule a new field relaxes is relaxed only for a plan that states the field. LVL-5's `through`
  lets a room list a wall of the floor below, which was always `room/cross-floor`; a plan with no
  wall through floors is checked as before.
- A new top-level part has its place in every drawing and export, and on the sheet
  (`packages/cli/src/sheet/coverage.ts`).
- A change that would read an existing plan differently needs a new version.

