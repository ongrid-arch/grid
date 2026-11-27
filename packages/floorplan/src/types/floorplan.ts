/**
 * FloorPlan — data model v1
 *
 * Closed conventions (do not change without team consensus):
 *
 * C1 · Wall thickness
 *   Grows symmetrically from the axis: thickness/2 on each side of the start→end line.
 *   The wall axis IS the reference line.
 *
 *   Reopened by HND-11 (lab WR-14): a wall MAY say its start→end line is one of its faces,
 *   `face: "left"` or `"right"` as you walk from start to end, so a survey taped to the inside
 *   faces is drawn from its own numbers, and a thickness guessed later, or left out, grows away
 *   from the room. The reading moves the line half the thickness to the wall's centre (the
 *   derived layer), so every reader still reads C1, and says so in `placedBy`; `statedWall`
 *   writes the face line back. Optional and never defaulted (version 1).
 *
 * C2 · Opening position
 *   `offset` is the distance from wall.start to the NEAR edge of the opening,
 *   measured along the wall axis.
 *   Invariant: offset >= 0 && offset + width <= wall_length.
 *
 *   Reopened by WRT-3 (lab WR-4): an opening MAY state an `anchor`, what Grid's edits keep its
 *   place from when its wall changes: an end of the wall, or a named room's inside face.
 *   `offset` is still where it is drawn from. Optional, never defaulted (version 1).
 *
 * C3 · Room boundary
 *   Area is measured from INNER FACES (usable area — what the user walks on).
 *   Wall IDs in `boundary` must be ordered counter-clockwise (top view).
 *
 * C4 · Coordinate system
 *   Floor plan: +X right, +Y forward (up in 2D view). Units: meters.
 *   Three.js mapping: (plan_x, height, -plan_y). Three.js Y is vertical.
 *
 * C5 · Floors
 *   A plan is a stack of floors sharing ONE origin and one coordinate system.
 *   Every wall and room names the floor it belongs to; an unstated floor means
 *   the ground floor, which is what a single-floor plan is. Openings inherit
 *   their wall's floor and never state one of their own.
 *   Floors are NEVER offset in XY to "stack" them, and there is no z in the
 *   file: 3D stacks floors on slabs, at heights derived from their walls
 *   (`floorElevations` in the geometry core). Each floor's own geometry still
 *   rises from z = 0 (C4); stacking only translates it.
 *   `Floor.level` orders floors (0 ground, 1 above, -1 basement). It is an
 *   ordering index, NOT an elevation — it sets the order of the stack, never
 *   a height. It need not be a whole number: a half level sorts between two.
 *
 *   Reopened by LVL-1 (lab VE-2, VE-3): a floor MAY state where it stands and how
 *   high it is, in metres, apart from its order. `elevation` is the top of its
 *   floor slab above the ground floor's (0), `height` its clear height, which a
 *   wall on it that states no height of its own takes, and `slab` the thickness
 *   of the slab it stands on. All three are optional and never defaulted, so a
 *   plan that states none reads and stacks exactly as before (version 1).
 *
 * C6 · Items (CNT-12, on CNT-11's decision)
 *   A placed item has a kind, a place (`at`, the middle of its footprint), a turn (degrees,
 *   counter-clockwise), a size (width along its back × depth to its front), a height and a label.
 *   Items are one list, never walls and never rooms: they add no area and close no outline. The
 *   room an item is in is found from the outlines (the smallest room on its floor that holds its
 *   middle), never named. This version holds fixed fixtures only (`ITEM_KINDS`); loose furniture,
 *   points and seats are later, in the same shape.
 *
 * C7 · North, front and where the building is (CNT-3)
 *   C4 names the sides of the drawing (+Y is called north, as rooms text and the edits do); the
 *   plan MAY also state its real north. `north` is the way north lies on the drawing, in degrees
 *   counter-clockwise from +Y, as a north symbol's `turn` is: 0 north is up the drawing, 90 it
 *   points to -X, -90 to +X. `yAxis` says which way +Y runs on the drawing as the building is
 *   seen from above, with +X to the right: `up` is C4, `down` says the coordinates are the
 *   building's mirror image (as a screen or an image's pixels run). `front` names the part whose
 *   outside face is the front: a wall, or an opening (the front door) by its wall. `site` says
 *   where the building sits: `origin`, a point of the plan, and where that point is on the earth
 *   (`latitude` and `longitude` in degrees, `elevation` in metres); it places nothing without
 *   `origin`. LVL-4 adds `site.ground`, the ground's level from the ground floor's (no `origin`
 *   needed). CNT-49 adds the ground on a slope: `site.groundSides`, a level for any of C4's four
 *   sides of the building; `site.fall`, a slope in percent `toward` one of the eight compass
 *   points of the drawing, through `ground` (else 0) at the middle of the building; and
 *   `site.groundEdges`, the levels at the two corners of an edge of the plot (C13), a falling
 *   street. Grid takes the one even slope that fits every stated level. CNT-50 adds
 *   `site.address` and `site.name`, the site's address and its own name in the person's words:
 *   one line each, kept as written and never looked up or checked against a map. All of them are
 *   optional and never defaulted, so a plan that states none reads exactly as before (version 1):
 *   it has no north, and its y runs up (C4).
 *
 * C8 · Where a value came from (WRT-6, lab WR-15, AE-4, AU3-6)
 *   A value may say where it came from: given by the person, measured, scanned or assumed, and
 *   how sure it is (`tolerance`, metres). It says so in the plan's `marks`, one list beside the
 *   parts, by part, id and value: no number becomes an object and no part changes shape.
 *   A value a wall leaves out stays not stated: the reading fills its thickness, height and kind
 *   for the geometry (the derived layer: a height from the wall's floor, else `WALL_DEFAULTS`)
 *   and says which in `unstated`, which is never written back (`statedWall`). Version 1.
 *
 * C9 · Facts of the person's own (CNT-9)
 *   A wall, an opening, a room, a floor and (CNT-52) an item MAY carry facts of the person's own in `properties`:
 *   a name and a value, text, a number or true or false (a fire rating, a department, a head
 *   count). They sit in that one object, never as loose fields, so a misspelt field of the
 *   format is still named (MSG-4). A room MAY state its room number in `number`. Grid checks
 *   nothing against a fact. Optional and never defaulted (version 1).
 *
 * C10 · The place (COD-3)
 *   `site.country` names the country the building will be built in, by a name or a code on
 *   Grid's list (`places.ts`); any other text is refused, naming the field and never the text.
 *   It picks the figures the checks apply (`@ongrid/rules`); a plan that states no place gets
 *   no figure applied, and its report says so. Optional and never defaulted (version 1).
 *
 * C11 · Saved views (VEW-3, lab SE-4, SE-7, S-16)
 *   A plan MAY keep named views in `views`: each a camera, by what it is pointed at (`target`: a
 *   point, and the room it is in), the compass bearing to the camera from the north the plan
 *   states (`bearingFrom: 'north'`, with that `north`) or from the top of the drawing (`'plan
 *   up'`), its tilt, distance and lens (focal length in millimetres on a sensor), the floor shown
 *   cut away and the floors drawn; and the same camera as the open BCF format writes one:
 *   `position`, `direction`, `up`, `fieldOfView` (vertical, degrees) and `aspectRatio`, in plan
 *   metres with z up from the ground floor's floor level. Grid writes both and reads the setting
 *   (`geometry/camera.ts`). Optional and never defaulted (version 1).
 *
 * C12 · Opening patterns (LVL-8)
 *   A facade's rhythm may be stated once, in the plan's `patterns`: one opening (its type, width,
 *   height, sill and door fields), a wall, a `count` or a `spacing` (or both), the `margins` kept
 *   clear at the wall's start and end (measured along its axis, as C2's offset is), and the
 *   `floors` above it is repeated on, onto the wall in the same line on each. A pattern is never an
 *   opening: it is expanded into plain openings (`expandPatterns` in the geometry core), with ids
 *   `<pattern>-<floor>-<n>`, before anything is drawn, measured, checked or exported, so every
 *   exporter and check reads plain openings only. The file keeps the pattern, not its openings.
 *   Optional and never defaulted (version 1).
 *
 * C13 · The plot (BRF-3, lab EL-16)
 *   `site.boundary` is the plot's outline, its corners in plan metres in order round it (either
 *   way round); edge n runs from point n to point n + 1, the last back to the first. `streets`
 *   names the edges on a street by number, and `setbacks` the set-backs the person asked for,
 *   from every edge, the street edges or one edge: the person's own figures, never a code's.
 *   `things` are the site's own fences, gates, paths, paving, trees and pools: never walls,
 *   rooms or fixtures, so they add no wall, area, note or storey height. The site is the ground:
 *   it is drawn on the ground floor's plan, and the building is measured to it from its outside
 *   face, every floor at or above the ground floor seen from above. All four are optional and
 *   never defaulted (version 1).
 *
 * C14 · What needs to be accessible (CNT-17, lab EL-15, C-14, J-15)
 *   A plan MAY say which rooms and routes need to be accessible, in `accessible`: `rooms`, by id,
 *   and `routes`, each `to` a room and `from` a room or, unstated, from the entrance. It is a
 *   mark of what is needed, never a finding: Grid measures the marked rooms and the ways to them
 *   (`grid_measure what=access`) and holds no figure they are checked against. Ids the mark names
 *   that are no room are said and not measured, never refused. Optional and never defaulted
 *   (version 1).
 *
 * C15 · Taped lengths (HND-11, lab WR-14)
 *   A plan MAY keep what was taped on site, beside the drawing, in `taped`: a room's side along
 *   one of its walls, or the distance between two of its corners (a diagonal), each with the
 *   length taped. They are checks, never geometry: nothing is drawn or placed from them, and
 *   every run says each one taped against drawn. Optional and never defaulted (version 1).
 *
 * C16 · Phases, and a fit-out on a base plan (CNT-10, lab EL-10, CP4-4)
 *   A wall, an opening and a room MAY state its `phase`: `existing` (it stands before the work and
 *   stays), `demolished` (it stands before the work and is taken out) or `new` (the work builds
 *   it). One plan then holds two states of the building: before the work (existing and
 *   demolished parts) and after it (existing and new parts). An opening that states no phase is
 *   in its wall's, when its wall is demolished or new. In a plan that states a phase anywhere, a
 *   part that states none stands before and after, as an existing one does; a plan that states
 *   none is read exactly as before. A plan MAY name a `base` plan, by its path from the project
 *   folder: the shell it is fitted out in. The base's walls and openings, as they stand after its
 *   own work, are read into the plan as existing and are never written back to it; the plan's own
 *   parts that state no phase are new. Both optional and never defaulted (version 1).
 *
 * C17 · Floor outlines (BRF-4, lab FD-1)
 *   A floor MAY state its `outline`: its outside face, its corners in plan metres in order round
 *   it, either way round, as `site.boundary` is written (C13). It is the one shape a floor's slab
 *   covers, its roof is cut from and its gross external area is measured to: joined with what
 *   the floor's walls enclose, so a floor with walls and no outline reads exactly as before. A
 *   floor with an outline and no walls is massing: its level, height (C5) and kind of building
 *   (`building`, CNT-5) give its gross area and its storey, and nothing inside it is checked.
 *   Floor inside the outline that no room claims is floor no room claims. A floor MAY also state
 *   how many `homes` it holds and how many `parking` spaces: the agent's proposal, which Grid
 *   counts against the person's own limits and never brings a figure for. All three are optional
 *   and never defaulted (version 1).
 *
 * C18 · Flats (CNT-4, lab EL-1, WR-6, AR-7, CP3-6)
 *   A plan MAY say which rooms make each flat (a dwelling, a unit), in `flats`: each with an id, a
 *   name, the `type` it is, by id, and its `rooms`, by id, on one floor or several (a duplex). A
 *   flat type is stated once, in `flatTypes` (an id and a name), and placed many times: a flat
 *   that is its type's mirror image says so (`mirrored`). A flat is a named group of rooms, never
 *   a room: it adds no floor and closes no outline, and a room is in one flat at most. The areas
 *   per flat, the mix by type, the flat's outline on the drawing and the IFC's zones are worked
 *   out from the list (`geometry/flats.ts`), never from the rooms' names. Ids a flat names that
 *   are no room or no type are named and left out of its figures, never refused. Both optional
 *   and never defaulted (version 1).
 *
 * C19 · Walls through floors, and floors that line up (LVL-5, lab VE-9, WR-9)
 *   C5 put every wall on one floor. Reopened: a wall MAY state `through`, the highest floor it rises
 *   through. It stands on its own `floor` and on every floor above it up to that one, in order of
 *   `level`: one wall, shared by those floors, so one edit moves it on all of them, and a room on
 *   any of them may list it. Its `height` is how high it stands above the `through` floor's level,
 *   as a wall of that floor; below that it runs up through each floor and slab between. An opening
 *   in it states its sill and height from the wall's own floor, as always (C2), and may reach as
 *   high as the wall does: a stair window through two storeys is one window. Each floor's slice
 *   holds the part of the wall and of its openings on that floor (`planForFloor`); the 3D view,
 *   the exports and the sections draw it once, whole.
 *   A floor whose outline does not lie over the floor below it, and a stair or lift room that does
 *   not lie over the one below, are said, unless the floor or room states `overhang: "meant"`.
 *   All optional and never defaulted (version 1): a plan that states none reads as before.
 *
 * C20 · Kinds of door and window (CNT-14)
 *   A door or window MAY state its kind (`DOOR_KINDS`, `WINDOW_KINDS`) and the part of it that
 *   opens (`opens`). Its handing stays in the wall's terms (`hinge`, `swing`, C2): the person's
 *   terms, the room it opens into and the side it is hinged on as seen from a room, are turned
 *   into them when written (`handingFromRooms`). For a door that slides, rolls or lifts, `hinge`
 *   names the end it opens toward and `swing` the face it runs on. A door with no kind is a single
 *   swinging leaf. Optional and never defaulted (version 1).
 *
 * C21 · A curved wall (CNT-18)
 *   A wall MAY be an arc of a circle: `arc.centre` is the circle's middle and `arc.sweep` the
 *   angle the wall turns through from `start` to `end` round it, in degrees, counter-clockwise
 *   positive as `turn` and `north` are; 360 (or -360) is a whole circle, whose `start` and `end`
 *   are one point. The radius is the distance from the centre to `start`, and `end` must lie on
 *   the circle where the sweep takes `start` (`wall/arc-ends-apart`). C1 holds about the curve:
 *   the wall grows thickness/2 on each side of it, `left` is the side on the left going from
 *   `start` to `end`. C2 holds along the curve: an opening's `offset` and `width` are measured
 *   along it, and its hole is straight between its two edges, as a door's leaf is. Optional and
 *   never defaulted, so a plan with no curved wall reads exactly as before (version 1).
 *
 * C23 · A plan that is part of a larger building (CNT-6, lab EL-4, R-10, S-3, EL-17, AC-7)
 *   A wall MAY be `separating`: a party wall, or a wall between a home and the building's common
 *   parts. A door through it into another home is refused as a route; one into a common part is a
 *   front door. A wall MAY state what lies `beyond` it where no room is drawn on one side, along
 *   whatever stretch of it has a room on one side only (MSG-13): `outside`, a `common` part of the
 *   building that is not drawn, or a `neighbour`, another home or property. A separating wall
 *   with nothing drawn beyond it and no `beyond` stated is read as one to a common part. A virtual
 *   wall with a room on one side only is an open edge, never a door: its `beyond` says where it
 *   leads, and unstated it leads where the drawing says (the outside, or floor no room claims).
 *   A floor MAY state what lies `above` it (`outside`, `common`, `neighbour`) and `below` it
 *   (`ground`, `outside`, `common`, `neighbour`): a floor with more of the building above it has
 *   no roof, and one with more of it below has no ground slab and is not a ground floor.
 *   A plan MAY name several `buildings`, each an id, a name and the floors that are its own, each
 *   floor in one building at most; each building stacks its own floors and has its own areas and
 *   height. A building MAY state its `pad` (LVL-23): the level of its own ground, in metres from the
 *   plan's datum (the 0 a floor's `elevation` is measured from). Its floors that state no elevation
 *   stack from it, and its ground floor, way out and height are read against it. A plan MAY draw `context`: shapes round it (a neighbour's house, the hall a stand stands
 *   in), each an outline on a floor, with a name and a height. A context shape is never a wall, a
 *   room or a part of any building: it is drawn and is in no measure, check or count. All optional
 *   and never defaulted (version 1): a plan that states none reads exactly as before.
 *
 * C24 · Named wall, door and window types, and room finishes (CNT-15)
 *   A plan MAY hold a short list of named types in `types`: `walls` (each a name, and any of a
 *   thickness, a height rule, a kind, whether it is glazed and a material), `doors` and `windows`
 *   (a name, and any of a width, a height, a window's sill, a kind (C20), the part that opens, whether
 *   it is glazed and a material). A wall names its type in `wallType`, a door in `doorType` and a
 *   window in `windowType`, by id. A value the part states itself wins over its type's: the type
 *   fills only what the part leaves out, and the reading records which in `typed`, which is never
 *   written back (`statedWall`, `statedOpening`), so one change to a type changes every part that
 *   takes it. A type's height is metres, or `floor`: as high as a wall on its floor that states none
 *   (C5, LVL-6). `types.defaults` names the type a wall of each kind, a door or a window takes when
 *   it names none: the template an office keeps. A dividing line takes no type. A room or a zone
 *   (CNT-8) MAY name its `finishes`: floor, walls, ceiling and skirting, by the person's own names;
 *   a zone's finish is its part of its room. Reopened by CNT-51: `skirting` MAY be `false`, no
 *   skirting, measured as none; `faces` MAY finish one wall's face in the room other than its walls
 *   (a wall id and a finish); `bands` MAY lay a finish `height` metres high from `from` metres above
 *   the floor on every face of the room, on one wall's face (`wall`) or behind an item (`behind`)
 *   over the length of its back, from the item's top unless `from` says. A band and a face take
 *   their area off the room's walls finish. Grid checks no finish and no material. An id a part
 *   names that no type has is said and read as no type, never refused. Optional and never
 *   defaulted: a plan with none reads exactly as before (version 1).
 *
 * C25 · Columns and a structural grid (CNT-16, lab EL-6)
 *   A plan MAY hold `columns`: each a thing of its own, never a wall, a room or a fixture. A column
 *   is `square` or `round`; `width` is a square column's side along its own x and a round one's
 *   diameter, and `depth` a square column's side along its own y (unstated, as wide: a square; a
 *   round column states none). `at` is its middle on the plan and `turn` turns a square column
 *   counter-clockwise about it, in degrees. It stands on its `floor` (C5) and MAY rise `through`
 *   floors above it as a wall does (C19): one column, shared by those floors. `height` is how high
 *   it stands above the floor it rises through; unstated, it rises to that floor's storey height.
 *   The room a column stands in is found from the outlines (the smallest room on its floor whose
 *   floor holds its middle, zones aside), never named, and the floor it covers there is taken off
 *   that room's area.
 *   A plan MAY hold `grids`: each a named structural grid, its lines set out from `origin` and
 *   turned by `turn` (degrees, counter-clockwise): `x` lines, which run along the grid's y, each
 *   `spacing` metres past the one before it, and `y` lines, which run along its x. A set's
 *   `names` name its lines in order, one each; unstated, x lines are numbered 1, 2, 3 and y lines
 *   lettered A, B, C. A grid is drawn on the `floors` it names (unstated, every floor) with its
 *   names and the spacing between its lines, and is in no measure or check. All optional and
 *   never defaulted (version 1): a plan that states none reads exactly as before.
 *
 * C26 · Outdoor space, roofed or open (CNT-7, lab EL-8, EL-18, R-8)
 *   A room MAY be an outdoor space: `outdoor` names its kind (`OUTDOOR_KINDS`: a garden, a
 *   courtyard, a terrace, a balcony, a light well, a porch, a carport, or `other`; `true` is one of
 *   no named kind), and `roofed` says whether a roof covers it. Unstated, a porch and a carport are
 *   roofed and every other kind is open (`outdoorRoofed`); `roofed` on a room that is not outdoor
 *   is read as nothing. An outdoor space is drawn and measured as a room, and to the building it is
 *   the outside: it is in no net, gross internal or gross external area but listed apart, weighted
 *   only by an area rule the caller states; it needs no door and no route; a wall between it and a
 *   room faces outside; and a wall that bounds outdoor space and no room (a fence, a parapet, the
 *   plot's edge drawn as a line) is no part of the building: it adds no area and sets no storey
 *   height. A route may pass through it: a door onto it is a way out when the space leads on to the
 *   outside. An outdoor space on the lowest level stands on the ground, with no slab, and only a
 *   roofed one has a roof. Its `use`, when stated, is kept, and no check reads it. Optional and
 *   never defaulted: a plan with none reads exactly as before (version 1).
 *   WRT-76: an outdoor space's edges are its own walls. A virtual wall with outdoor space on its
 *   one side is an open edge. A wall MAY state `railing` to draw it as a line in plan. A solid
 *   wall below the plan cut is drawn in outline.

 *
 * C29 · Parking bays and ramps (CNT-19, lab EL-11)
 *   A plan MAY hold `bays`: each a parking bay, a thing of its own, never a room or a wall. `at` is
 *   its middle on the plan, `width` its size across (side to side) and `length` its size along
 *   (the way a car drives in), in metres; unturned its length runs along the plan's y, and `turn`
 *   turns it counter-clockwise about its middle, in degrees. `number` is the bay's own number as
 *   marked (text: `12`, `B1-07`). It stands on its `floor` (C5). Bays are counted per floor; a bay
 *   takes nothing off a room's area, and two bays of one floor may not share a number.
 *   A plan MAY hold `ramps`: each a way for vehicles between two floors, stated once across them
 *   as a stair is: `from` and `to` are the floors it joins (either may be the higher), `width` its
 *   width across its middle line, and `run` that middle line on the plan, from its edge on `from`
 *   to its edge on `to` (a straight ramp may say `start` and `end` instead); each point between is
 *   a turn. The two levels it joins are the floors' levels in metres (C5) and its slope, in
 *   percent (metres of rise per 100 metres along its run), is worked out from them. `slope` MAY
 *   state the slope the design means, also in percent; Grid keeps it and says when the levels and
 *   the run give another. A ramp opens the slab of its upper floor over it. Whether a car can turn
 *   into a bay or up a ramp is a swept-path check these make possible and Grid does not make. All
 *   optional and never defaulted (version 1): a plan that states none reads exactly as before.
 *
 * C30 · A library of fixtures, furniture and typical rooms, placed by name (CNT-20)
 *   An item's kind is one the kinds registry holds (`geometry/itemKinds.ts`): Grid's fixtures
 *   (`FIXTURE_KINDS`), its furniture (`FURNITURE_KINDS`, which takes no free floor: it can be
 *   moved) or a kind another program registers. An item MAY name a library entry in `library`,
 *   by name; the entry fills what the item leaves out, its `kind`, `size`, `height`, `clearance`
 *   and `label`, and the reading records which in `fromLibrary`, which is never written back
 *   (`statedItem`). The entry is the plan's own, in its top-level `library` (each `name`, `kind`,
 *   `size`, `height`, and any of `clearance`, `label` and `source`), else Grid's built-in one
 *   (`library/builtIn.ts`), whose sizes never change once released. An office's entry is copied
 *   into the plan's `library` when an item is placed from it, so the plan reads the same without
 *   the office's folder. An item MAY state `clearance`: metres of clear floor it keeps in front of
 *   it, as wide as it is, and (CNT-47) `clearSides`, the same behind it and at its left and
 *   right. A name no entry has fills nothing and is said, never refused. Optional and never
 *   defaulted: a plan with none reads exactly as before (version 1).
 *
 * C31 · A trace image under the plan (HND-10, lab AU2, WR-13, T-5, AE-11)
 *   `referenceImage` is a scan, photo or sketch to trace over. Its `path` starts from the project
 *   folder, stays inside it and ends in `.png`, `.jpg`, `.jpeg` or `.pdf` (VEW-67: a PDF's
 *   `page`, the first unstated, whose largest raster image is the picture). Its pixels run from its
 *   top-left corner with y down; `at` is the point of the plan that corner lies on ([0, 0]
 *   unstated), `rotation` turns it about that corner, in degrees counter-clockwise (0 unstated),
 *   and its scale is metres per pixel: stated as `scale`, or set from two points on it and the
 *   length between them on the building (`calibration`), never both. Pixel (u, v) lies at
 *   `at + turn(rotation)(u·scale, -v·scale)`. With neither it has no scale, and is drawn at one
 *   centimetre a pixel and said to be unscaled. It lies under one floor: `floor`, else the lowest,
 *   the floor a picture draws when none is asked for. It is drawn under that floor's plan in the pictures an agent gets, and is
 *   in no measure, check, export or sheet. All optional and never defaulted: a plan that states
 *   only `path` reads as before (version 1).
 *
 * C32 · Grid's words in any language, kept in the plan (MSG-24)
 *   `display.language` MAY name any language by a BCP-47 tag (`de`, `pt-BR`), read as its primary
 *   subtag in lower case (`pt`). `display.words` MAY give the plan's own words for Grid's keys:
 *   a map from a language, as that subtag and never `en`, to a map from a key of Grid's messages
 *   (`messages/en.ts`) to its wording in the language, with exactly the English key's named
 *   placeholders and keeping to the text rule. Grid writes a key in a language from the plan's
 *   word, else from the file it ships for the language (`es.ts`), else in English. A word the
 *   reader cannot take is left out on its own, with a reading line, and the English is said. The
 *   decimal mark is the display's (`decimal`), never the words'; room names are never words.
 *   Optional and never defaulted: a plan with none reads exactly as before (version 1).
 */
import { z } from 'zod'
import { limit } from '../geometry/tolerances'
import { BOUNDARY_MAX, PARTS_MAX, PROPERTIES_MAX, textProblem, type TextKind } from './planText'
import { factKey } from './facts'
import { placeProblem } from './places'
import { roofFrame, roofTop } from './roofFrame'
import { en } from '../messages/en'
import { readLanguage } from '../messages/languages'
import { roomUseOfLabel } from '../messages/uses'
import { english, said } from '../messages/say'
import { ringProblem } from '../geometry/ring'
import { builtInItem } from '../library/builtIn'

export * from './planText'
export * from './facts'

/**
 * The error `parseFloorPlan` throws and one problem it lists. Callers take them from here and
 * never import the schema library themselves, so they always meet the copy the schema uses.
 */
export { ZodError as PlanSchemaError } from 'zod'
export type { ZodIssue as PlanSchemaIssue } from 'zod'

/**
 * A name, an id or a path from the plan (MSG-9): one line, no control or direction characters,
 * no lone half of a character pair, and no longer than its limit (`planText.ts`). A refusal
 * names the part and the limit, never the text.
 */
/** MSG-24 (C32): a language as `readLanguage` writes it, its primary subtag in lower case. */
const LANGUAGE_TAG = /^[a-z]{2,3}$/

export const text = (kind: TextKind) =>
  z.string().superRefine((value, ctx) => {
    const problem = textProblem(value, kind)
    if (problem !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem })
  })

/** COD-3: a place, by a name or a code on Grid's list. A refusal names the field and the rule, never the text. */
const placeText = () =>
  z.string().superRefine((value, ctx) => {
    const problem = textProblem(value, 'name') ?? placeProblem(value)
    if (problem !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem })
  })

/** A list of parts, at most `PARTS_MAX` long (MSG-9). */
const parts = <T extends z.ZodTypeAny>(item: T, noun: string) =>
  z.array(item).superRefine((list, ctx) => {
    if (list.length <= PARTS_MAX) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `has ${list.length.toLocaleString('en-US')} entries; a plan may have at most ${PARTS_MAX.toLocaleString('en-US')} ${noun}`,
    })
  })

/**
 * Every number in a plan is finite (MSG-15, lab T-7). JSON reads a number too large to hold,
 * such as 1e400, as infinity; `z.number()` alone would accept it, and every area and export
 * built on it would hold "Infinity". How large a finite number may be is the geometry's
 * question (`largest` in `geometry/tolerances.ts`), not the schema's.
 */
const finite = (): z.ZodNumber =>
  z.number().finite({ message: 'Expected a finite number: this one is too large to hold and reads as infinity' })

// Coordinate pair [x, y] in meters (floor plan space, see C4)
const Vec2 = z.tuple([finite(), finite()])

/**
 * CNT-9 (C9): facts of the person's own, by name: text (one line, at most a name's length), a
 * finite number, or true or false. A name is one line and not blank; two names one part carries
 * may not differ only in capitals, spaces, dashes or underscores (`factKey`), and a part carries
 * at most `PROPERTIES_MAX`. A fact the schema refuses is left out on its own, not with the others
 * (`readParts.ts`). Grid checks nothing against a fact.
 */
export const PropertiesSchema = z
  .record(
    text('name').pipe(z.string().refine((name) => name.trim().length > 0, { message: 'is blank: a fact needs a name' })),
    z.union([text('name').pipe(z.string().min(1)), finite(), z.boolean()]),
  )
  .superRefine((facts, ctx) => {
    const names = Object.keys(facts)
    if (names.length > PROPERTIES_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `has ${names.length.toLocaleString('en-US')} facts; one part may carry at most ${PROPERTIES_MAX}` })
      return
    }
    const seen = new Map<string, string>()
    for (const name of names) {
      const key = factKey(name)
      const first = seen.get(key)
      if (first === undefined) seen.set(key, name)
      else ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'names the same fact as another name on this part, in other capitals or spaces' })
    }
  })

/** C5: the floor an entity belongs to when it does not name one. */
export const DEFAULT_FLOOR_ID = 'ground'

/**
 * CNT-5: what kind of building the plan is, or a floor of it is (`Floor.building`). A figure
 * check runs only in the kinds of building its figures were read for (`packages/rules`). One
 * kind for each, in Grid's own words (`BUILDING_TYPE_TEXT`); a building of mixed use says so
 * floor by floor.
 */
export const BUILDING_TYPES = [
  'home',
  'office',
  'shop',
  'food',
  'hotel',
  'school',
  'health',
  'sport',
  'assembly',
  'industry',
  'warehouse',
  'parking',
  // CNT-40: a block of flats (the home figures cover it), stations and terminals, museums, galleries,
  // libraries and theatres, labs and cleanrooms, and prisons and police custody.
  'flats',
  'transport',
  'culture',
  'lab',
  'custody',
  'other',
] as const

export const BuildingTypeSchema = z.enum(BUILDING_TYPES)

export type BuildingType = z.infer<typeof BuildingTypeSchema>

/** Each kind of building as a sentence names it, with its article: "this plan is an office" (MSG-11: `check.building.*`, in English). */
export const BUILDING_TYPE_TEXT: Readonly<Record<BuildingType, string>> = Object.fromEntries(
  BUILDING_TYPES.map((type) => [type, en[`check.building.${type}`]])
) as Record<BuildingType, string>

/**
 * CNT-40: words for a kind of building that plainly mean one (`hospital` is `health`, `apartments`
 * `flats`), folded as `foldUseWord` folds them. A kind written as one of these, or in other capitals,
 * is read as the kind; any other word is left as it is, for the schema to refuse.
 */
export const BUILDING_WORDS: Readonly<Record<string, BuildingType>> = {
  house: 'home', dwelling: 'home', residence: 'home', residential: 'home',
  flat: 'flats', apartment: 'flats', apartments: 'flats', maisonette: 'flats', maisonettes: 'flats',
  blockofflats: 'flats', studenthousing: 'flats', studentresidence: 'flats', hallsofresidence: 'flats', coliving: 'flats',
  hospital: 'health', clinic: 'health', surgery: 'health', carehome: 'health', hospice: 'health', medical: 'health', healthcare: 'health',
  station: 'transport', terminal: 'transport', airport: 'transport', metro: 'transport', railway: 'transport', train: 'transport',
  trainstation: 'transport', busstation: 'transport', port: 'transport',
  museum: 'culture', gallery: 'culture', library: 'culture', theatre: 'culture', theater: 'culture', cinema: 'culture',
  concerthall: 'culture', cultural: 'culture',
  laboratory: 'lab', laboratories: 'lab', labs: 'lab', cleanroom: 'lab', research: 'lab',
  prison: 'custody', jail: 'custody', police: 'custody', policestation: 'custody', courthouse: 'custody',
  restaurant: 'food', cafe: 'food', bar: 'food', pub: 'food',
  nursery: 'school', kindergarten: 'school', college: 'school', university: 'school',
  gym: 'sport', stadium: 'sport', church: 'assembly', cathedral: 'assembly', factory: 'industry', workshop: 'industry',
  garage: 'parking', carpark: 'parking',
}

/**
 * A kind of building as Grid reads it (CNT-40): one of `BUILDING_TYPES` in any capitals, or a word that
 * plainly means one (`BUILDING_WORDS`), so `Hospital` is `health` and `apartments` is `flats`. Anything
 * else is left as it is.
 */
export function readBuilding(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const lower = value.trim().toLowerCase()
  if ((BUILDING_TYPES as readonly string[]).includes(lower)) return lower
  const folded = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return Object.hasOwn(BUILDING_WORDS, folded) ? BUILDING_WORDS[folded] : value
}

/** The four sides of the drawing: north is +Y (C4). */
export const COMPASS_SIDES = ['north', 'east', 'south', 'west'] as const

/** LVL-6: the shapes a roof over a floor can take. */
export const ROOF_SHAPES = ['flat', 'mono-pitch', 'gable', 'hip'] as const

/** LVL-6: the two ways a gable's ridge can run, along the sides of the drawing (C4). */
export const RIDGE_RUNS = ['east-west', 'north-south'] as const

/**
 * LVL-6: a window in the roof's slope. `at` is its middle on the plan (C4); `width` runs along the
 * slope's eaves and `length` up the slope, both measured on the slope, as a rooflight's size is
 * given. It lies in one plane of the roof, wholly inside the roof.
 */
export const RooflightSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  at: Vec2,
  width: finite().positive(),
  length: finite().positive(),
})

/** LVL-20: the two shapes of dormer: a flat-roofed box, or one with a small gable roof of its own. */
export const DORMER_SHAPES = ['box', 'gable'] as const

/**
 * LVL-20: a dormer standing out of one slope of the roof. `at` is the middle of its front on the
 * plan (C4) and `width` its front's width, along the slope's eaves. `height` is metres above the
 * floor's level: a box dormer's flat ceiling, the top of a gable dormer's sides, from which its own
 * two slopes rise at its `pitch` (unstated, the roof's) to its ridge. `depth` is metres on plan from
 * its front up the slope; unstated, the dormer runs back until it meets the roof.
 */
export const DormerSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  shape: z.enum(DORMER_SHAPES),
  at: Vec2,
  width: finite().positive(),
  height: finite().positive(),
  depth: finite().positive().optional(),
  pitch: finite().gt(0).lt(90).optional(),
})

/**
 * LVL-6: the roof over a floor, as planes its walls and rooms are cut to. Heights are metres
 * above the floor's level, to the roof's underside (the ceiling under it), measured on the lines
 * of the floor's outside walls: the roof's eaves lie along the sides of the smallest rectangle
 * that holds those lines, turned to the floor's longest outside wall.
 *
 * - `flat`: the underside is level at `eaves`.
 * - `mono-pitch`: one plane, from `eaves` on the side opposite `highSide`, rising to that side.
 * - `gable`: two planes from `eaves` on the two sides along `ridgeRuns` (unstated, along the
 *   rectangle's longer sides), meeting at the ridge over the middle.
 * - `hip`: four planes from `eaves` on all four sides, at one pitch.
 *
 * A sloped roof states its `pitch` in degrees, or its `ridge`, the underside's height at the top
 * (the high side of a mono-pitch roof), never both. `rooflights` are its windows. `dormers`
 * (LVL-20, `DormerSchema`) raise its underside where they stand: sections and headroom read them;
 * the 3D model, elevations, exports and take-off do not yet, and the check says so.
 */
export const RoofSchema = z
  .object({
    shape: z.enum(ROOF_SHAPES),
    eaves: finite().positive(),
    pitch: finite().gt(0).lt(90).optional(),
    ridge: finite().positive().optional(),
    ridgeRuns: z.enum(RIDGE_RUNS).optional(),
    highSide: z.enum(COMPASS_SIDES).optional(),
    rooflights: parts(RooflightSchema, 'rooflights in one roof').optional(),
    dormers: parts(DormerSchema, 'dormers in one roof').optional(),
  })
  .superRefine((roof, ctx) => {
    const add = (path: string, message: string): void => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
    const sloped = roof.shape !== 'flat'
    if (!sloped && (roof.pitch !== undefined || roof.ridge !== undefined)) add(roof.pitch !== undefined ? 'pitch' : 'ridge', 'belongs to a sloped roof: a flat roof states only its eaves, the height of its underside')
    if (sloped && (roof.pitch === undefined) === (roof.ridge === undefined)) add('pitch', 'needs the pitch in degrees or the ridge height in metres, one of the two: either gives the slope')
    if (roof.ridge !== undefined && !(roof.ridge > roof.eaves)) add('ridge', 'must be higher than the eaves: the roof rises from its eaves to its ridge')
    if (roof.ridgeRuns !== undefined && roof.shape !== 'gable') add('ridgeRuns', 'belongs to a gable roof: only a gable says which way its ridge runs')
    if (roof.shape === 'mono-pitch' && roof.highSide === undefined) add('highSide', 'is needed on a mono-pitch roof: the side of the drawing it rises to, north, east, south or west')
    if (roof.highSide !== undefined && roof.shape !== 'mono-pitch') add('highSide', 'belongs to a mono-pitch roof: only it has one high side')
  })

/**
 * LVL-5 (C19): the one word `overhang` takes, on a floor or on a room used as a stair or a lift:
 * it does not line up with the floor below on purpose.
 */
export const OVERHANG_MEANT = ['meant'] as const

/** CNT-6 (C23): what lies above a floor: the open air (it has a roof), or more of the building. */
export const ABOVE_FLOOR = ['outside', 'common', 'neighbour'] as const
/** CNT-6 (C23): what lies below a floor: the ground, the open air, or more of the building. */
export const BELOW_FLOOR = ['ground', 'outside', 'common', 'neighbour'] as const

export const FloorSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  name: text('name').pipe(z.string().min(1)),
  // Ordering only: 0 = ground, 1 = the floor above it, -1 = basement, 0.5 a half level
  // between them. NOT an elevation: that is `elevation` (C5).
  level: finite().default(0),
  // LVL-1 (C5, reopened). Optional and never defaulted: unstated, the floor stands where the
  // stacking rule puts it (`floorElevations`), as in a plan written before LVL-1.
  // Metres from the ground floor's floor level (0) to the top of this floor's slab.
  elevation: finite().optional(),
  // Metres from this floor's level to its ceiling: what a wall on it with no height takes.
  height: finite().positive().optional(),
  // Metres: the thickness of the slab this floor stands on.
  slab: finite().nonnegative().optional(),
  // LVL-4: metres the outside walls of this floor rise above the roof over it, where it has one
  // (every part of the floor with nothing above it). Optional and never defaulted: unstated, the
  // roof has no parapet (version 1).
  parapet: finite().positive().optional(),
  // LVL-6: the roof over this floor (RoofSchema): flat, mono-pitch, gable or hip, which its walls
  // and rooms are cut to. Optional and never defaulted: unstated, the roof is flat on the floor's
  // walls, as LVL-4 made it (version 1).
  roof: RoofSchema.optional(),
  // CNT-5: what kind of building this floor is, when it is not the plan's (`FloorPlan.building`):
  // the shop on the ground floor of a block of flats. Optional and never defaulted: unstated, the
  // floor is the plan's kind (version 1).
  building: z.preprocess(readBuilding, BuildingTypeSchema).optional(),
  // LVL-5 (C19): the floor's outline overhangs or sits back from the floor below it on purpose, so
  // Grid does not say it does not line up. Optional and never defaulted (version 1).
  overhang: z.enum(OVERHANG_MEANT).optional(),
  // CNT-9 (C9): facts of the person's own. Optional and never defaulted (version 1).
  properties: PropertiesSchema.optional(),
  // BRF-4 (C17): the floor's outside face, its corners in order round it, either way round; a
  // last point on the first closes it. Joined with what the walls enclose for the slab, the roof
  // and the gross external area. Optional and never defaulted (version 1).
  outline: z
    .array(Vec2)
    .min(3)
    .max(BOUNDARY_MAX)
    .superRefine((points, ctx) => {
      const open = boundaryEdgeCount(points) === points.length ? points : points.slice(0, -1)
      const problem = ringProblem(open.map(([x, y]) => ({ x, y })))
      if (problem !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `is not an outline: ${problem}` })
    })
    .optional(),
  // BRF-4 (C17): how many homes the floor holds, and how many parking spaces: the agent's
  // proposal, counted against the person's own limits. Optional and never defaulted (version 1).
  homes: z.number().int().min(0).max(PARTS_MAX).optional(),
  parking: z.number().int().min(0).max(PARTS_MAX).optional(),
  // CNT-6 (C23): what lies above and below the floor, when the plan is part of a larger building.
  // Optional and never defaulted: unstated, the floor's roof and slab are worked out as before.
  above: z.enum(ABOVE_FLOOR).optional(),
  below: z.enum(BELOW_FLOOR).optional(),
})

// CNT-6 (C23): `separating` is a party wall, or a wall between a home and the common parts.
export const WallKindSchema = z.enum(['exterior', 'interior', 'partition', 'separating'])

/**
 * CNT-6 (C23): what lies past a wall's side with no room drawn on it, or past an open edge:
 * the outside, a common part of the building that is not drawn (a landing, a stair, a hall's
 * aisle), or a neighbour (another home or property). Words of the plan's own, never inferred.
 */
export const BEYOND_WALL = ['outside', 'common', 'neighbour'] as const
export const BeyondWallSchema = z.enum(BEYOND_WALL)

/**
 * CNT-10 (C16): what the work does to a wall, an opening or a room: it stands before and stays
 * (`existing`), it stands before and is taken out (`demolished`), or the work builds it (`new`).
 */
export const PHASES = ['existing', 'demolished', 'new'] as const
export const PhaseSchema = z.enum(PHASES)

/** CNT-10: the fields that carry a phase, for whatever must place each (the sheet's `PHASE_COVERAGE`). */
export const PHASE_FIELDS = ['walls.phase', 'openings.phase', 'rooms.phase'] as const
export type PhaseField = (typeof PHASE_FIELDS)[number]

/**
 * What a wall that does not state its thickness or height gets. A virtual wall is a
 * dividing line on the floor (an open-plan room contour, e.g. a kitchen open to the
 * dining room): it has no material, so it takes no floor and stands no height, and
 * 0 is both what it may state and what it gets.
 */
export const WALL_DEFAULTS = {
  solid: { thickness: 0.2, height: 2.7 },
  virtual: { thickness: 0, height: 0 },
} as const

/**
 * WRT-6 (lab AU3-6): what a solid wall may leave out, which the reading fills (`WALL_DEFAULTS`,
 * or its floor's stated height) and records in `unstated`, so a value left out stays "not
 * stated" for everything that reads the plan back or writes it again.
 */
export const UNSTATED_WALL_VALUES = ['thickness', 'height', 'kind'] as const
export type UnstatedWallValue = (typeof UNSTATED_WALL_VALUES)[number]

/**
 * Set by `withFloorHeights` on a wall whose height it took from the wall's floor, so that
 * `withWallDefaults` records the height as not stated. A symbol, so no file can write it.
 */
const HEIGHT_FROM_FLOOR = Symbol('height from the floor')

/**
 * CNT-15 (C24): set by `withTypes` on a wall or an opening, the values it took from its type, so
 * that its schema records them in `typed`. A symbol, so no file can write it, and a part read
 * twice is filled once.
 */
const FROM_TYPE = Symbol('values from its type')

/** CNT-15: the values of a wall, a door or a window that its type may fill, and `typed` may name. */
export const TYPED_VALUES = ['wallType', 'doorType', 'windowType', 'thickness', 'height', 'kind', 'width', 'sill', 'opens'] as const
export type TypedValue = (typeof TYPED_VALUES)[number]

/**
 * Fills the thickness and height a wall leaves out, by whether it is virtual, and records what a
 * solid wall left out in `unstated` (WRT-6). A file's own `unstated` is not read: it is the
 * reading's, and `readingNotes` names it as a field Grid does not know.
 */
function withWallDefaults(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const wall: Record<string, unknown> = { ...(raw as Record<string, unknown>) }
  delete wall.unstated
  // CNT-15 (C24): what the wall's type filled in (`withTypes`), as the reading's own `typed`.
  delete wall.typed
  const typed = (raw as Record<symbol, unknown>)[FROM_TYPE]
  if (Array.isArray(typed) && typed.length > 0) wall.typed = typed
  const virtual = wall.virtual === true
  const defaults = virtual ? WALL_DEFAULTS.virtual : WALL_DEFAULTS.solid
  const left: UnstatedWallValue[] = []
  if (!virtual) {
    if (wall.thickness === undefined) left.push('thickness')
    if (wall.height === undefined || (raw as Record<symbol, unknown>)[HEIGHT_FROM_FLOOR] === true) left.push('height')
    if (wall.kind === undefined) left.push('kind')
  }
  const filled: Record<string, unknown> = {
    ...wall,
    thickness: wall.thickness === undefined ? defaults.thickness : wall.thickness,
    height: wall.height === undefined ? defaults.height : wall.height,
    ...(left.length > 0 ? { unstated: left } : {}),
  }
  // HND-11: a wall placed by its face stands, in the reading, on its centre line, and says which
  // face its file gave (`placedBy`). A face, a thickness or an end that cannot be read is left
  // for the schema to name, as it is.
  const face = filled['face']
  const thickness = virtual ? 0 : filled['thickness']
  if (isFace(face) && isEndPair(filled['start']) && isEndPair(filled['end']) && typeof thickness === 'number' && Number.isFinite(thickness) && thickness >= 0) {
    const [start, end] = centreFromFace(filled['start'], filled['end'], face, thickness, arcOf(filled))
    delete filled['face']
    return { ...filled, start, end, placedBy: face }
  }
  return filled
}

/**
 * HND-11 (C1, reopened): which face of a wall its start→end line is, as you walk from its start
 * to its end. The wall's body lies on the other side of the line.
 */
export const WALL_FACES = ['left', 'right'] as const
export type WallFace = (typeof WALL_FACES)[number]

type Pair = readonly [number, number]

const isFace = (value: unknown): value is WallFace => value === 'left' || value === 'right'
const isEndPair = (value: unknown): value is Pair =>
  Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])

/** A written number without the arithmetic's last digits: a face moved there and back reads as it was stated. */
const written = (value: number): number => {
  const clean = Number(value.toPrecision(15))
  return Object.is(clean, -0) ? 0 : clean
}

/**
 * The line `start`→`end` moved `by` metres to its left (to its right when negative), or null for
 * a line of no length, which has no left.
 */
function shiftedLine(start: Pair, end: Pair, by: number): [[number, number], [number, number]] | null {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (!(length > 0) || !Number.isFinite(length)) return null
  const nx = (-dy / length) * by
  const ny = (dx / length) * by
  return [
    [start[0] + nx, start[1] + ny],
    [end[0] + nx, end[1] + ny],
  ]
}

/** CNT-18 (C21): a curved wall's arc, as a file states it, when it can be read. */
export interface WallCurveOf {
  readonly centre: Pair
  readonly sweep: number
}

/** CNT-18: a wall's `arc`, as its file states it or as Grid reads it, or undefined when it has none it can read. */
function arcOf(wall: Readonly<Record<string, unknown>>): WallCurveOf | undefined {
  const arc = wall['arc']
  if (typeof arc !== 'object' || arc === null || Array.isArray(arc)) return undefined
  const { centre, sweep } = arc as Record<string, unknown>
  return isEndPair(centre) && typeof sweep === 'number' && Number.isFinite(sweep) && sweep !== 0 ? { centre, sweep } : undefined
}

/**
 * CNT-18: the curve `start`→`end` round `arc.centre` moved `by` metres to its left (to its right
 * when negative): each end along its own radius, since a curve's faces are circles round the same
 * centre. Going counter-clockwise the left is toward the centre. Null when an end is on the
 * centre or the move would take it through the centre.
 */
function shiftedArc(start: Pair, end: Pair, by: number, arc: WallCurveOf): [[number, number], [number, number]] | null {
  const at = (p: Pair): [number, number] | null => {
    const r = Math.hypot(p[0] - arc.centre[0], p[1] - arc.centre[1])
    const to = r - Math.sign(arc.sweep) * by
    if (!(r > 0) || !(to > 0)) return null
    return [arc.centre[0] + ((p[0] - arc.centre[0]) * to) / r, arc.centre[1] + ((p[1] - arc.centre[1]) * to) / r]
  }
  const s = at(start)
  const e = at(end)
  return s === null || e === null ? null : [s, e]
}

/** A wall's line moved to its left: along its radius for a curve, square to it for a straight line. */
function shifted(start: Pair, end: Pair, by: number, arc: WallCurveOf | undefined): [[number, number], [number, number]] | null {
  return arc === undefined ? shiftedLine(start, end, by) : shiftedArc(start, end, by, arc)
}

/**
 * HND-11: a wall's centre line from the face its file gives: half the thickness away from that
 * face, into the wall's body. A left face has the body on its right. A line of no length is
 * returned as it is.
 */
export function centreFromFace(start: Pair, end: Pair, face: WallFace, thickness: number, arc?: WallCurveOf): [[number, number], [number, number]] {
  return shifted(start, end, (face === 'left' ? -1 : 1) * (thickness / 2), arc) ?? [[start[0], start[1]], [end[0], end[1]]]
}

/** HND-11: the face line a file gives a wall placed by its face, from the wall's centre line. */
export function faceFromCentre(start: Pair, end: Pair, face: WallFace, thickness: number, arc?: WallCurveOf): [[number, number], [number, number]] {
  const [s, e] = shifted(start, end, (face === 'left' ? 1 : -1) * (thickness / 2), arc) ?? [[start[0], start[1]], [end[0], end[1]]]
  return [
    [written(s[0]), written(s[1])],
    [written(e[0]), written(e[1])],
  ]
}

const otherFace = (face: WallFace): WallFace => (face === 'left' ? 'right' : 'left')

/** The thickness a wall's line is moved by: none for a dividing line, else the one stated or the default. */
function movingThickness(wall: Readonly<Record<string, unknown>>): number {
  if (wall['virtual'] === true) return 0
  const stated = wall['thickness']
  const value = typeof stated === 'number' ? stated : typeof stated === 'string' ? Number.parseFloat(stated) : Number.NaN
  return Number.isFinite(value) && value > 0 ? value : WALL_DEFAULTS.solid.thickness
}

/**
 * HND-11: a wall, as a file states it or as Grid reads it, with its centre line's ends moved to
 * `ends` (either may be left out), and turned over left to right when `mirrored`. A wall its file
 * places by its face (`face`) keeps that face, and the line written is the face's; one Grid read
 * so (`placedBy`) keeps saying so. Every change that moves a wall end goes through here, so no
 * centre point ever lands in a file as a face.
 */
export function wallWithEnds<T extends Record<string, unknown>>(wall: T, ends: { readonly start?: Pair | undefined; readonly end?: Pair | undefined; readonly arc?: WallCurveOf | undefined }, mirrored = false): T {
  const face = wall['face']
  if (isFace(face) && isEndPair(wall['start']) && isEndPair(wall['end'])) {
    const thickness = movingThickness(wall)
    // CNT-18: a curved wall's face is found from its arc as it was, and written from its new one.
    const before = arcOf(wall)
    const [s, e] = centreFromFace(wall['start'], wall['end'], face, thickness, before)
    const now = mirrored ? otherFace(face) : face
    const [start, end] = faceFromCentre(ends.start ?? s, ends.end ?? e, now, thickness, ends.arc ?? before)
    return { ...wall, start, end, face: now }
  }
  const placed = wall['placedBy']
  const moved: Record<string, unknown> = { ...wall }
  if (ends.start !== undefined) moved['start'] = [...ends.start]
  if (ends.end !== undefined) moved['end'] = [...ends.end]
  if (isFace(placed) && mirrored) moved['placedBy'] = otherFace(placed)
  return moved as T
}

/**
 * A wall as its file states it (WRT-6): without the values the reading filled in and without
 * `unstated`, for whatever writes a wall back, so a default never lands in a file that stated
 * none. HND-11: a wall Grid read from its face (`placedBy`) is given back by that face, with
 * `face`, as its file gave it, round its curve for a curved wall (CNT-32). CNT-15 (C24): without the values its type filled in (`typed`), so a
 * change to the type still reaches it. A wall that left nothing out is returned as it is.
 */
export function statedWall<T extends { readonly unstated?: readonly UnstatedWallValue[]; readonly placedBy?: WallFace | undefined; readonly typed?: readonly TypedValue[] | undefined }>(wall: T): Omit<T, 'unstated' | 'placedBy' | 'typed'> {
  if (wall.unstated === undefined && wall.placedBy === undefined && wall.typed === undefined) return wall
  const { unstated, placedBy, typed, ...rest } = wall
  const left: readonly string[] = [...(unstated ?? []), ...(typed ?? [])]
  const out: Record<string, unknown> = { ...rest }
  if (placedBy !== undefined && isEndPair(out['start']) && isEndPair(out['end'])) {
    // CNT-32: a curved wall's face is written back round its own curve, as it was read, so its
    // ends stay on their circle however often it is written.
    const [start, end] = faceFromCentre(out['start'], out['end'], placedBy, movingThickness(out), arcOf(out))
    const ordered: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(out)) {
      ordered[key] = key === 'start' ? start : key === 'end' ? end : value
      if (key === 'end') ordered['face'] = placedBy
    }
    for (const key of left) delete ordered[key]
    return ordered as Omit<T, 'unstated' | 'placedBy' | 'typed'>
  }
  for (const key of left) delete out[key]
  return out as Omit<T, 'unstated' | 'placedBy' | 'typed'>
}

/**
 * CNT-15 (C24): an opening as its file states it: without the values its door or window type
 * filled in (`typed`), for whatever writes an opening back. One that took nothing is returned as it is.
 */
export function statedOpening<T extends { readonly typed?: readonly TypedValue[] | undefined }>(opening: T): Omit<T, 'typed'> {
  if (opening.typed === undefined) return opening
  const { typed, ...rest } = opening
  const out: Record<string, unknown> = { ...rest }
  for (const key of typed) delete out[key]
  return out as Omit<T, 'typed'>
}

/** Whether a wall's height was left out of its file, so the reading filled it (WRT-6). */
export function heightStated(wall: { readonly unstated?: readonly UnstatedWallValue[] }): boolean {
  return !(wall.unstated ?? []).includes('height')
}

/**
 * WRT-6 (lab AU3-6): whether a solid wall's height is stated by nothing, not by the wall and not
 * by its floor, so the reading gave it Grid's default (`WALL_DEFAULTS`). A height its floor
 * states is stated, once, on the floor. A dividing line has no height to state.
 */
export function heightByDefault(
  plan: { readonly floors?: readonly { readonly id: string; readonly height?: number | undefined }[] | undefined },
  wall: { readonly virtual?: boolean | undefined; readonly floor?: string | undefined; readonly through?: string | undefined; readonly unstated?: readonly UnstatedWallValue[] | undefined },
): boolean {
  if (wall.virtual === true || heightStated(wall)) return false
  // LVL-5: a wall through floors takes its height from the floor it rises through.
  const floor = wall.through ?? wall.floor ?? DEFAULT_FLOOR_ID
  return (plan.floors ?? []).find((f) => f.id === floor)?.height === undefined
}

/**
 * CNT-18 (C21): what makes a wall a curve. `sweep` is degrees, counter-clockwise positive, never 0
 * and never more than a whole turn.
 */
export const WallArcSchema = z.object({
  centre: Vec2,
  sweep: finite().refine((value) => value !== 0 && Math.abs(value) <= 360, {
    // MSG-11: its words are a key of the message files, said in English as the schema's are.
    message: english(said('read.arc.sweep')),
  }),
})

export const WallSchema = z.preprocess(
  withWallDefaults,
  z
    .object({
      id: text('id'),
      start: Vec2,
      end: Vec2,
      // C1: grows thickness/2 on each side of the start→end axis. A virtual wall's
      // written thickness is never used: it is a line, measured on its axis.
      thickness: finite(),
      height: finite(),
      // Explicit field — do not infer from thickness; an interior wall can be thick
      kind: WallKindSchema.default('interior'),
      // Boundary wall with no physical material (open-plan room contour, e.g. kitchen open to dining)
      virtual: z.boolean().optional(),
      // WRT-76 (C26): the wall is a railing or balustrade, drawn as a line in plan.
      railing: z.boolean().optional(),
      // C5: unstated means the ground floor. Optional, not defaulted — a plan written
      // before floors existed must round-trip with no key added to it.
      floor: text('id').pipe(z.string().min(1)).optional(),
      // LVL-5 (C19): the highest floor the wall rises through, from its own floor: it is one wall
      // on each floor between, and its height is measured from this floor's level. Optional and
      // never defaulted: unstated, the wall stands on its own floor only (version 1).
      through: text('id').pipe(z.string().min(1)).optional(),
      // CNT-18 (C21): the wall is an arc round `centre`, turning `sweep` degrees from start to end.
      // Optional and never defaulted: unstated, the wall is straight (version 1).
      arc: WallArcSchema.optional(),
      // CNT-9 (C9): facts of the person's own. Optional and never defaulted (version 1).
      properties: PropertiesSchema.optional(),
      // CNT-10 (C16): what the work does to it. Optional and never defaulted (version 1).
      phase: PhaseSchema.optional(),
      // CNT-6 (C23): what lies past its side with no room drawn on it, along every stretch with a
      // room on one side only. Optional and never defaulted (version 1).
      beyond: BeyondWallSchema.optional(),
      // HND-11 (C1, reopened): start→end is this face of the wall, not its centre line. The
      // reading moves the wall to its centre line (`withWallDefaults`), so a wall Grid read has
      // `placedBy` in its place. Optional and never defaulted (version 1).
      face: z.enum(WALL_FACES).optional(),
      // HND-11: the face its file placed it by. Grid's reading only, written back as `face`.
      placedBy: z.enum(WALL_FACES).optional(),
      // WRT-6: what the file left out and the reading filled in (`withWallDefaults`). Grid's
      // reading only: never in a file, and written back by `statedWall` without those values.
      unstated: z.array(z.enum(UNSTATED_WALL_VALUES)).optional(),
      // CNT-15 (C24): the wall type it takes, by id in `types.walls`: it fills what the wall leaves
      // out. Optional and never defaulted (version 1); `types.defaults` may give one in the reading.
      wallType: text('id').pipe(z.string().min(1)).optional(),
      // CNT-15: what its type filled in (`withTypes`). Grid's reading only, never written back.
      typed: z.array(z.enum(TYPED_VALUES)).optional(),
    })
    .superRefine((wall, ctx) => {
      // A solid wall needs some thickness and height; a dividing line may have none.
      const virtual = wall.virtual === true
      for (const key of ['thickness', 'height'] as const) {
        const value = wall[key]
        if (virtual ? value >= 0 : value > 0) continue
        // The same issue `.positive()` gave before, so its message and path do not change.
        ctx.addIssue({ code: z.ZodIssueCode.too_small, type: 'number', minimum: 0, inclusive: virtual, exact: false, path: [key] })
      }
    }),
)

// What a room is for. Explicit, like `Wall.kind`: nothing infers it from the
// room's name, shape or area. CNT-5: the list reaches past homes, in groups: rooms of a home,
// rooms people work, buy, learn, are treated or train in, rooms for moving between floors and
// rooms, and rooms for services. `assembly` is a room people gather in: a hall, an auditorium,
// a function room. The person's own word for a room is its name ("Pooja room",
// "Bryggers"); its use is the one of these it is.
export const ROOM_USES = [
  'bedroom',
  'living',
  'dining',
  'kitchen',
  'bathroom',
  'toilet',
  'utility',
  'study',
  'office',
  'meeting',
  'reception',
  'retail',
  'classroom',
  'treatment',
  'waiting',
  'sport',
  'changing',
  'staff',
  'worship',
  'assembly',
  'corridor',
  'stair',
  // LVL-3: a lift shaft, drawn as a room on every floor it serves. The drawing checks line the
  // shafts up from floor to floor; a lift is never taken as a way out.
  'lift',
  'storage',
  'plant',
  'parking',
  // CNT-40: stations and terminals, wards and theatres, galleries and libraries, labs, cells and
  // back of house, and the rooms of an open-plan workplace.
  'platform',
  'concourse',
  'ticketing',
  'checkin',
  'security',
  'gate',
  'ward',
  'operating',
  'anteroom',
  'gallery',
  'auditorium',
  'stage',
  'foyer',
  'library',
  'cafe',
  'bar',
  'breakout',
  'print',
  'comms',
  'phonebooth',
  'focus',
  'wellbeing',
  'training',
  'lab',
  'cleanroom',
  'cell',
  'prep',
  'other',
] as const

export const RoomUseSchema = z.enum(ROOM_USES)

/**
 * CNT-5: words people and agents write for a room's use that plainly mean one of `ROOM_USES`,
 * local words among them (`bryggers`, Danish for a utility room; `pooja`, a prayer room), folded
 * as `foldUseWord` folds them. A use written as one of these words is read as its use; the word
 * stays the room's name, which is where the person's own word belongs.
 *
 * No word here is read as `bedroom`, `living` or `dining`: the figure checks look at rooms of
 * those uses (`packages/rules`), so a room comes under them only by its author's own choice of
 * use, never by a word Grid read for them. `bed` or `lounge` stays a suggestion (`nearestUse`).
 * Nor does a word that means two things (`hall`, `studio`) read as either.
 */
export const USE_WORDS: Readonly<Record<string, RoomUse>> = {
  wc: 'toilet',
  loo: 'toilet',
  lavatory: 'toilet',
  restroom: 'toilet',
  washroom: 'toilet',
  shower: 'bathroom',
  showers: 'bathroom',
  ensuite: 'bathroom',
  kitchenette: 'kitchen',
  laundry: 'utility',
  scullery: 'utility',
  bryggers: 'utility',
  offices: 'office',
  workspace: 'office',
  boardroom: 'meeting',
  conference: 'meeting',
  shop: 'retail',
  sales: 'retail',
  servery: 'retail',
  teaching: 'classroom',
  consulting: 'treatment',
  consultation: 'treatment',
  examination: 'treatment',
  gym: 'sport',
  fitness: 'sport',
  locker: 'changing',
  lockers: 'changing',
  staffroom: 'staff',
  prayer: 'worship',
  pooja: 'worship',
  puja: 'worship',
  chapel: 'worship',
  hallway: 'corridor',
  passage: 'corridor',
  landing: 'corridor',
  lobby: 'corridor',
  circulation: 'corridor',
  stairs: 'stair',
  staircase: 'stair',
  stairwell: 'stair',
  elevator: 'lift',
  store: 'storage',
  stockroom: 'storage',
  warehouse: 'storage',
  closet: 'storage',
  cupboard: 'storage',
  pantry: 'storage',
  larder: 'storage',
  wardrobe: 'storage',
  plantroom: 'plant',
  boiler: 'plant',
  garage: 'parking',
  carpark: 'parking',
  // CNT-40: plain words for the uses past homes. `clean` and `ante` are `cleanroom` and `anteroom`
  // with the last "room" taken off.
  platforms: 'platform',
  tickets: 'ticketing',
  ticketing: 'ticketing',
  tickethall: 'ticketing',
  bagdrop: 'checkin',
  screening: 'security',
  gates: 'gate',
  boarding: 'gate',
  wards: 'ward',
  bedbay: 'ward',
  bedbays: 'ward',
  surgery: 'treatment',
  theatre: 'operating',
  operatingtheatre: 'operating',
  ante: 'anteroom',
  airlock: 'anteroom',
  galleries: 'gallery',
  exhibition: 'gallery',
  exhibit: 'gallery',
  lecture: 'auditorium',
  cinema: 'auditorium',
  foyers: 'foyer',
  libraries: 'library',
  reading: 'library',
  archive: 'storage',
  cafes: 'cafe',
  cafeteria: 'cafe',
  coffee: 'cafe',
  buffet: 'bar',
  pub: 'bar',
  bars: 'bar',
  printing: 'print',
  printer: 'print',
  copy: 'print',
  server: 'comms',
  servers: 'comms',
  comm: 'comms',
  phone: 'phonebooth',
  phonepod: 'phonebooth',
  quiet: 'focus',
  wellness: 'wellbeing',
  laboratory: 'lab',
  labs: 'lab',
  laboratories: 'lab',
  clean: 'cleanroom',
  cells: 'cell',
  detention: 'cell',
  foodprep: 'prep',
  preparation: 'prep',
  // CNT-40: old and regional words for a room, read as the use the person means by them; the word
  // stays the room's name. The one place a word is read as a use the figure checks look at (`OLD_USE_WORDS`).
  parlour: 'living',
  parlor: 'living',
  sitting: 'living',
  box: 'bedroom',
}

/** CNT-40: the words of `USE_WORDS` read as `bedroom`, `living` or `dining`: old and regional words only. */
export const OLD_USE_WORDS: readonly string[] = ['parlour', 'parlor', 'sitting', 'box']

/**
 * A use word as `USE_WORDS` holds it: lower case, letters and digits only, and a last "room"
 * taken off, so `Pooja room`, `staff_room` and `Plant-room` are `pooja`, `staff` and `plant`.
 */
export function foldUseWord(word: string): string {
  const folded = word.toLowerCase().replace(/[^a-z0-9]/g, '')
  return folded.length > 4 && folded.endsWith('room') ? folded.slice(0, -4) : folded
}

/**
 * A use as Grid reads it (MSG-4, CNT-5): whatever its capitals, so `Bedroom` is `bedroom`; the
 * use's label in a language Grid writes (MSG-11, `USE_LABELS`), so `dormitorio` is `bedroom`;
 * and a word that plainly means a use (`USE_WORDS`), so `WC` is `toilet` and `staff room` is
 * `staff`. Anything else is left as it is, for the schema to read as unstated and
 * `readingNotes` to name.
 */
export function readUse(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const lower = value.toLowerCase()
  if ((ROOM_USES as readonly string[]).includes(lower)) return lower
  const labelled = roomUseOfLabel(value)
  if (labelled !== null) return labelled
  const folded = foldUseWord(value)
  if ((ROOM_USES as readonly string[]).includes(folded) && !FIGURE_READ_USES.includes(folded)) return folded
  return Object.hasOwn(USE_WORDS, folded) ? USE_WORDS[folded] : value
}

/** The uses no word is read as (`USE_WORDS`): written as they are, or not at all. */
const FIGURE_READ_USES: readonly string[] = ['bedroom', 'living', 'dining']

/**
 * CNT-5: who a room is for. `private`: one household's or one tenant's own (a flat's bedroom, an
 * office let to one firm). `shared`: shared by some households or tenants and not others (a
 * kitchen shared by four student rooms). `common`: the building's, for everyone in it (the
 * stair, the entrance lobby, the bin store). `commercial`: let or run as a business (a shop).
 * Optional and never defaulted; no check reads it yet.
 */
export const ROOM_TENURES = ['private', 'shared', 'common', 'commercial'] as const

export const RoomTenureSchema = z.enum(ROOM_TENURES)

/**
 * CNT-7 (C26): the kinds of outdoor space a room may be. `other` is one of no kind on the list (a
 * driveway, a side passage); a room that states `outdoor: true` is read as one too.
 */
export const OUTDOOR_KINDS = ['garden', 'courtyard', 'terrace', 'balcony', 'light-well', 'porch', 'carport', 'other'] as const

export const OutdoorKindSchema = z.enum(OUTDOOR_KINDS)

/** CNT-7 (C26): the kinds a roof usually covers, so one that does not state `roofed` is roofed. */
export const ROOFED_BY_KIND: ReadonlySet<OutdoorKind> = new Set<OutdoorKind>(['porch', 'carport'])

/** A list of wall ids round a room or one of its holes, at most `BOUNDARY_MAX` long (MSG-9). */
const wallList = () =>
  z.array(text('id')).superRefine((list, ctx) => {
    if (list.length <= BOUNDARY_MAX) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `lists ${list.length.toLocaleString('en-US')} walls; a room may list at most ${BOUNDARY_MAX.toLocaleString('en-US')}`,
    })
  })

/** LVL-4: the most points a lowered zone of a ceiling may have. */
export const CEILING_ZONE_MAX = BOUNDARY_MAX

/**
 * LVL-4: a part of a room's ceiling that is lower than the rest: a bulkhead over a kitchen, a
 * strip lowered for ducts. `points` is its outline on the plan (C4), three points or more; `height`
 * is metres from the room's floor to its underside.
 */
export const LoweredZoneSchema = z.object({
  name: text('name').optional(),
  points: z
    .array(Vec2)
    .min(3)
    .superRefine((list, ctx) => {
      if (list.length <= CEILING_ZONE_MAX) return
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `has ${list.length.toLocaleString('en-US')} points; a lowered zone may have at most ${CEILING_ZONE_MAX.toLocaleString('en-US')}`,
      })
    }),
  height: finite().positive(),
})

/**
 * LVL-4: a room's ceiling. It is flat, at the room's `height` (ARE-10) above its floor, or, when
 * the room states none, as high as its storey; `lowered` are the zones under it at their own
 * heights. Stating `ceiling` says the room has one: the IFC writes it, and a ceiling plan, lights
 * and grilles come later.
 */
export const CeilingSchema = z.object({
  lowered: parts(LoweredZoneSchema, 'lowered zones in one ceiling').optional(),
})

/**
 * CNT-15 (C24): the four finishes a room or a zone may name, each by the person's own name for it
 * ("Oak boards", "Porcelain tile"): the floor, the walls' inside faces, the ceiling and the
 * skirting. Grid checks none of them; it measures each and groups the quantities by name.
 */
export const FINISH_SURFACES = ['floor', 'walls', 'ceiling', 'skirting'] as const
export type FinishSurface = (typeof FINISH_SURFACES)[number]

const finishName = () => text('name').pipe(z.string().refine((value) => value.trim().length > 0, { message: 'is blank: leave the finish out instead' }))

/** CNT-51 (C24): one wall's face in the room finished other than the room's walls: a feature wall. */
export const FinishFaceSchema = z.object({
  wall: text('id'),
  finish: finishName(),
})

/**
 * CNT-51 (C24): a band of finish on the room's wall faces, `height` metres high from `from` metres
 * above its floor: on every face of the room, on one wall's face (`wall`), or behind an item
 * (`behind`) over the length of its back, from the item's top unless `from` says.
 */
export const FinishBandSchema = z.object({
  finish: finishName(),
  height: finite().positive(),
  from: finite().nonnegative().optional(),
  wall: text('id').optional(),
  behind: text('id').optional(),
})

export const FinishesSchema = z.object({
  floor: finishName().optional(),
  walls: finishName().optional(),
  ceiling: finishName().optional(),
  // CNT-51: false says the room has no skirting, so none is measured.
  skirting: z.union([finishName(), z.literal(false)]).optional(),
  // CNT-51: wall faces finished other than the room's walls, and bands of finish on its faces.
  faces: parts(FinishFaceSchema, 'finished faces').optional(),
  bands: parts(FinishBandSchema, 'finish bands').optional(),
})

export const RoomSchema = z.object({
  id: text('id'),
  name: text('name'),
  // C3: ordered wall IDs in counter-clockwise order (top view), inner-face contour
  boundary: wallList(),
  // ARE-6: the holes in the room, one list of walls each, in the order they are met going
  // round the hole: a courtyard in a ring gallery, a core in a car park. The room's floor is
  // its outline less each hole, measured to the faces of the hole's walls that look into the
  // room, so the hole's walls are not floor either. Optional and never defaulted, so a plan
  // written before ARE-6 reads with no key added (version 1).
  holes: parts(wallList(), 'holes in one room').optional(),
  // C5: unstated means the ground floor. Every wall in `boundary` must stand on this
  // same floor — a cross-floor boundary is a validation error. LVL-5 (C19): a wall that rises
  // through floors stands on each of them.
  floor: text('id').pipe(z.string().min(1)).optional(),
  // Unstated means "not said", never a default, so an old plan gains no key. An
  // unknown value is read as unstated instead of rejecting the whole plan: `use`
  // only feeds advisory checks, and a parse error means no preview at all. MSG-4: a use is
  // read whatever its capitals, and one Grid does not know is named (`readingNotes`).
  use: z.preprocess(readUse, RoomUseSchema).optional().catch(undefined),
  // ARE-5: the room sits inside another room on its floor, as a wardrobe pod, a lift shaft or
  // an en-suite drawn inside a bedroom. The room it sits in is found from the outlines, never
  // named here: the smallest room on the same floor that holds it. Its floor, with its own
  // walls, is taken off that room, so every square metre is counted once. Optional and never
  // defaulted, so a plan written before ARE-5 reads with no key added (version 1).
  inside: z.boolean().optional(),
  // CNT-8: the room is a zone of another room on its floor, the one with this id: where you
  // sleep, cook or sit in an open-plan room. The zone is drawn and measured, and lies inside its
  // room on purpose: the room is measured, counted and checked as a whole, and the zone is
  // counted in no total (`geometry/zones.ts`). Optional and never defaulted, so a plan written
  // before CNT-8 reads with no key added (version 1).
  partOf: text('id').pipe(z.string().min(1)).optional(),
  // ARE-10: the room's height, floor to ceiling, in metres. Optional and never defaulted, so
  // a plan written before it reads with no key added (version 1). Unstated, the room is as
  // high as the lowest solid wall round it (`roomHeight` in the command's measuring).
  height: finite().positive().optional(),
  // LVL-7: how far the room's floor stands above (positive) or below (negative) its storey's
  // floor level, in metres: a genkan, a sunken wet area, a stage. A platform inside a room is
  // a room marked `inside` with its own offset, so one field says both. The step is drawn at
  // the openings to rooms at another level, and along a dividing line between them. Optional
  // and never defaulted: unstated, the room stands on its storey's floor (version 1).
  floorOffset: finite().optional(),
  // LVL-4: the room is a void, open to the floor below: it has no floor, so its storey's slab is
  // open over it and the room below rises through it. It adds no floor area and needs no door.
  // Optional and never defaulted (version 1).
  void: z.boolean().optional(),
  // LVL-4: the room's ceiling (CeilingSchema): it stands at the room's `height`, with any zones
  // lowered under it. Optional and never defaulted (version 1).
  ceiling: CeilingSchema.optional(),
  // CNT-5: who the room is for (`ROOM_TENURES`). Optional and never defaulted (version 1).
  tenure: RoomTenureSchema.optional(),
  // LVL-5 (C19): a room used as a stair or a lift that does not lie over the one below on
  // purpose, so Grid does not say it is shifted. Optional and never defaulted (version 1).
  overhang: z.enum(OVERHANG_MEANT).optional(),
  // CNT-5: the firm's own type for the room, as its room data sheets name it ("B2 double
  // bedroom", "Consult A"), beside the fixed `use`. Grid keeps it and reads nothing from it.
  // Optional and never defaulted (version 1).
  roomType: text('name').optional(),
  // CNT-9 (C9): the room's number as the person states it, text: "101", "G.04", "B-12a". The
  // schedules give it in place of the number Grid counts, and the IFC space takes it as its name.
  // Optional and never defaulted (version 1).
  number: text('id').pipe(z.string().refine((value) => value.trim().length > 0, { message: 'is blank: leave the number out instead' })).optional(),
  // CNT-9 (C9): facts of the person's own. Optional and never defaulted (version 1).
  properties: PropertiesSchema.optional(),
  // CNT-10 (C16): what the work does to it. Optional and never defaulted (version 1).
  phase: PhaseSchema.optional(),
  // CNT-15 (C24): its floor, wall, ceiling and skirting finishes, by the person's own names. A
  // zone's are its part of its room. Optional and never defaulted (version 1).
  finishes: FinishesSchema.optional(),
  // CNT-7 (C26): the room is an outdoor space of this kind (`true`: of no named kind), and whether
  // a roof covers it. Both optional and never defaulted (version 1); `roofed` is read only with
  // `outdoor`.
  outdoor: z.union([OutdoorKindSchema, z.literal(true)]).optional(),
  roofed: z.boolean().optional(),
  // ARE-60: whether the room is heated or cooled, so in the living area under air. Unstated, a
  // room is conditioned unless its use is parking (`isConditioned` in `geometry/areas.ts`). On an
  // outdoor space (C26: to the building, the outside), a void (no floor) or a zone (its room's
  // floor) it is read as nothing. Optional and never defaulted (version 1).
  conditioned: z.boolean().optional(),
})

export const OpeningTypeSchema = z.enum(['door', 'window', 'opening'])

/** What an opening's anchor measures from: an end of its wall, or a side of the drawing. */
export const ANCHOR_FROM = ['start', 'end', ...COMPASS_SIDES] as const

/**
 * WRT-3 (C2, reopened; lab WR-4): what an opening's place is kept from when Grid's edits change
 * its wall. `offset` stays the one place the opening is drawn from (C2); the anchor only tells
 * an edit what to keep. `from` is an end of the wall (`start`, `end`, or the end toward a side
 * of the drawing, so the wall's direction need not be known) or, with `room`, that room's
 * inside face on that side: the opening keeps the distance from it to its own nearer edge, as
 * rooms text writes `0.4 from west of hall`. Unstated, an edit keeps the opening where it is in
 * the building. Optional and never defaulted (version 1).
 */
export const OpeningAnchorSchema = z
  .object({
    from: z.enum(ANCHOR_FROM),
    room: text('id').pipe(z.string().min(1)).optional(),
  })
  .superRefine((anchor, ctx) => {
    if (anchor.room !== undefined && (anchor.from === 'start' || anchor.from === 'end')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'measures from a side of the room it names: north, east, south or west, not an end of the wall' })
    }
  })

/**
 * CNT-14 (C20): the kinds of door, and of window, a plan may state. A door with no kind is a
 * single swinging leaf, as every door was before (version 1). `single` and `double` are one or
 * two hinged leaves; `sliding` slides along its wall, `pocket` into it; `folding` folds to one
 * side in panels; `roller` rolls up and `garage` lifts overhead. A window may be `single` or
 * `double` (one or two hinged casements), `sliding`, `fixed` (nothing opens) or `high-level` (set
 * high in its wall, above the plan's cut). A window with no kind is drawn and measured as before.
 */
export const DOOR_KINDS = ['single', 'double', 'sliding', 'pocket', 'folding', 'roller', 'garage'] as const
export const WINDOW_KINDS = ['single', 'double', 'sliding', 'fixed', 'high-level'] as const
export const OPENING_KINDS = ['single', 'double', 'sliding', 'pocket', 'folding', 'roller', 'garage', 'fixed', 'high-level'] as const
export type DoorKind = (typeof DOOR_KINDS)[number]
export type WindowKind = (typeof WINDOW_KINDS)[number]
export type OpeningKind = (typeof OPENING_KINDS)[number]

/**
 * CNT-14: the part of a door or window that opens, when it is not the whole of it: a door's leaf
 * beside a fixed panel, the main leaf of a pair, a window's casement. `width` is along the wall and
 * `height` from its foot; unstated, the height is the opening's. It is at the end the door hangs
 * from (`hinge`), else at the wall's start end. Unstated, the whole opening opens (version 1).
 */
export const OpeningPartSchema = z.object({
  width: finite().positive(),
  height: finite().positive().optional(),
})

/** CNT-15 (C24): an opening's own `typed` from what `withTypes` marked; a file's own is not read. */
function withOpeningTyped(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const typed = (raw as Record<symbol, unknown>)[FROM_TYPE]
  const record = raw as Record<string, unknown>
  if (!Object.hasOwn(record, 'typed') && !(Array.isArray(typed) && typed.length > 0)) return raw
  const opening: Record<string, unknown> = { ...record }
  delete opening.typed
  if (Array.isArray(typed) && typed.length > 0) opening.typed = typed
  return opening
}

/** An opening's fields, as an object. Read an opening with `OpeningSchema`, which also records `typed`. */
export const OpeningFieldsSchema = z.object({
  id: text('id'),
  wall: text('id'),
  type: OpeningTypeSchema,
  // C2: distance from wall.start to the NEAR edge of the opening, along the wall axis (m)
  offset: finite().nonnegative(),
  width: finite().positive(),
  // Height from the floor to the bottom of the opening; 0 for doors (sill at floor)
  sill: finite().nonnegative().default(0),
  height: finite().positive(),
  // Doors only. Optional and never defaulted: absent means "not decided",
  // and an undecided door draws no swing. `hinge` names the end of the opening
  // along the wall axis; `start` is the end nearer wall.start (the C2 datum).
  // `swing` names the face the door opens toward; `left` is the face the wall
  // normal points at (90 degrees counter-clockwise from start->end), as in
  // geometry/wall.ts `wallFaces`.
  hinge: z.enum(['start', 'end']).optional(),
  swing: z.enum(['left', 'right']).optional(),
  // CNT-14 (C20): its kind (`DOOR_KINDS`, `WINDOW_KINDS`) and the part of it that opens
  // (`OpeningPartSchema`). Optional and never defaulted (version 1): a door that states no kind is
  // one swinging leaf, and the whole of an opening opens.
  kind: z.enum(OPENING_KINDS).optional(),
  opens: OpeningPartSchema.optional(),
  // WRT-3: what its place is kept from when an edit changes its wall (OpeningAnchorSchema).
  anchor: OpeningAnchorSchema.optional(),
  // CNT-9 (C9): facts of the person's own. Optional and never defaulted (version 1).
  properties: PropertiesSchema.optional(),
  // CNT-10 (C16): what the work does to it; unstated, its wall's when that is demolished or new.
  // Optional and never defaulted (version 1).
  phase: PhaseSchema.optional(),
  // CNT-15 (C24): a door's type, by id in `types.doors`, and a window's, by id in `types.windows`:
  // each fills what the opening leaves out. Optional and never defaulted (version 1).
  doorType: text('id').pipe(z.string().min(1)).optional(),
  windowType: text('id').pipe(z.string().min(1)).optional(),
  // CNT-15: what its type filled in (`withTypes`). Grid's reading only, never written back.
  typed: z.array(z.enum(TYPED_VALUES)).optional(),
})

export const OpeningSchema = z.preprocess(withOpeningTyped, OpeningFieldsSchema)

/** LVL-8: the most floors above its own that one opening pattern may be repeated on. */
export const PATTERN_FLOORS_MAX = 200

/**
 * LVL-8 (C12): the one opening a pattern repeats: an opening without its id, wall and place, which
 * the pattern gives each copy.
 */
export const PatternOpeningSchema = z.object({
  type: OpeningTypeSchema,
  width: finite().positive(),
  sill: finite().nonnegative().default(0),
  height: finite().positive(),
  hinge: z.enum(['start', 'end']).optional(),
  swing: z.enum(['left', 'right']).optional(),
  // CNT-14 (C20): its kind and the part of it that opens, carried into every opening it makes.
  kind: z.enum(OPENING_KINDS).optional(),
  opens: OpeningPartSchema.optional(),
  // CNT-15 (C24): its door or window type, carried into every opening it makes; the type fills
  // what the pattern's opening leaves out.
  doorType: text('id').pipe(z.string().min(1)).optional(),
  windowType: text('id').pipe(z.string().min(1)).optional(),
})

/**
 * LVL-8 (C12): a facade's rhythm, stated once. On `wall`, between `margins.start` metres from its
 * start and `margins.end` from its end (each 0 when unstated), along its axis:
 *
 * - `count` alone: that many openings, spread evenly, the first at the start margin and the last
 *   at the end margin (one alone sits in the middle);
 * - `spacing` alone: an opening every `spacing` metres, centre to centre, from the start margin,
 *   as many as fit before the end margin;
 * - both: `count` openings `spacing` apart, from the start margin.
 *
 * `floors` names the floors above to repeat it on: on each, the openings stand where they stand on
 * this wall, on the wall in the same line. Optional and never defaulted (version 1).
 */
export const OpeningPatternSchema = z
  .object({
    id: text('id'),
    wall: text('id'),
    opening: PatternOpeningSchema,
    count: z.number().int().positive().max(PARTS_MAX).optional(),
    spacing: finite().positive().optional(),
    margins: z.object({ start: finite().nonnegative().optional(), end: finite().nonnegative().optional() }).optional(),
    floors: z.array(text('id').pipe(z.string().min(1))).max(PATTERN_FLOORS_MAX).optional(),
  })
  .superRefine((pattern, ctx) => {
    if (pattern.count === undefined && pattern.spacing === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['count'], message: 'needs a count, a spacing or both: how many openings, or how far apart' })
    }
  })

/**
 * HND-10 (C31): how a trace image's scale is set from two points on it and the length between
 * them: `from` and `to` in the picture's own pixels, from its top-left corner with y down, and
 * `length`, the length they lie apart on the building, in metres.
 */
export const TraceCalibrationSchema = z.object({
  from: Vec2,
  to: Vec2,
  length: finite().positive(),
}).superRefine((calibration, ctx) => {
  if (calibration.from[0] === calibration.to[0] && calibration.from[1] === calibration.to[1]) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: english(said('read.trace.samePoint')) })
  }
})

export const ReferenceImageSchema = z.object({
  // Path relative to the project directory
  path: text('path'),
  opacity: finite().min(0).max(1).default(0.4),
  // Bumped on every write. The destination filename is stable
  // (assets/reference.<ext>), so replacing an image with one of the same
  // extension changes no other field — without this the renderer would keep
  // showing the previous picture until a reload.
  updatedAt: finite().optional(),
  // HND-10 (C31): the floor it is traced on, where its top-left corner lies on the plan, its turn
  // and its scale, stated (`scale`, metres per pixel) or set from two points (`calibration`).
  // Optional and never defaulted (version 1).
  floor: text('id').pipe(z.string().min(1)).optional(),
  at: Vec2.optional(),
  rotation: finite().optional(),
  scale: finite().positive().optional(),
  calibration: TraceCalibrationSchema.optional(),
  // VEW-67 (C31): for a PDF, the page whose picture is traced, from 1. Optional (version 1).
  page: finite().int().positive().optional(),
}).superRefine((image, ctx) => {
  if (image.scale !== undefined && image.calibration !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scale'], message: english(said('read.trace.scaleAndCalibration')) })
  }
})

/** LVL-3: the most points a stair's walking line may have: a foot, a head and the turns between. */
export const STAIR_RUN_MAX = 64

/**
 * LVL-3 (decided in LVL-2): a stair is a designed object, stated once across the two floors it
 * joins. The plan says what is meant (where it starts and ends, how wide it is, and the line a
 * person walks up it) and Grid works out the rest: the rise from the floors' levels (LVL-1), the
 * number of risers, their height, the going and the pitch (`planStairs` in the geometry core),
 * and which room it leaves from and arrives in, which joins the two floors for the way-out check.
 * Optional and never defaulted, so a plan written before LVL-3 reads with no key added (version 1).
 */
/**
 * A straight stair said by its two ends, `start` and `end`, as the lab's agents first wrote one
 * (lab H-1, h01a), is read as the walking line `[start, end]`. Only when it states no `run`.
 */
export function withRunFromEnds(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const stair = raw as Record<string, unknown>
  if (stair.run !== undefined || stair.start === undefined || stair.end === undefined) return raw
  const { start, end, ...rest } = stair
  return { ...rest, run: [start, end] }
}

export const StairSchema = z.preprocess(withRunFromEnds, z.object({
  id: text('id'),
  name: text('name').optional(),
  // The floor the walking line starts on and the floor it ends on. Either may be the higher.
  from: text('id').pipe(z.string().min(1)),
  to: text('id').pipe(z.string().min(1)),
  // Metres: the width of the flight, measured across the walking line, which runs down its middle.
  width: finite().positive(),
  // The walking line, in plan coordinates (C4): from the edge of the stair on `from` (the middle
  // of its first riser there) to its edge on `to`. A straight flight has two points; each point
  // between is a turn, with a square landing as wide as the flight centred on it. A straight
  // stair may say its two points as `start` and `end` instead (`withRunFromEnds`).
  run: z
    .array(Vec2)
    .min(2)
    .superRefine((list, ctx) => {
      if (list.length <= STAIR_RUN_MAX) return
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `has ${list.length.toLocaleString('en-US')} points; a stair's walking line may have at most ${STAIR_RUN_MAX}`,
      })
    }),
  // How many risers, when the design has chosen. Unstated, Grid works it out from the rise and
  // the walking line's length. Optional and never defaulted.
  risers: z.number().int().positive().optional(),
}))

/**
 * CNT-12: the fixtures an item may be. CNT-11 decided fixtures first, because the checks need
 * them. `kitchen-run` is a run of base units with its worktop, the sink and hob in it.
 */
export const FIXTURE_KINDS = ['toilet', 'basin', 'shower', 'bath', 'kitchen-run'] as const

/**
 * CNT-20 (C30): the furniture an item may be, Grid's own plain symbols: a bed, a table (a side
 * table is a small one), a chair, a sofa and a storage unit (a wardrobe, a cupboard, shelves).
 * CNT-42: and an armchair, a stool, a desk, a rug (which lies on the floor, so things stand on
 * it) and a plant, each counted as its own kind. Furniture is drawn, exported and checked as a
 * fixture is, and takes no free floor: it can be moved.
 */
export const FURNITURE_KINDS = ['bed', 'table', 'chair', 'sofa', 'storage', 'armchair', 'stool', 'desk', 'rug', 'plant'] as const

/**
 * CNT-47 (C30): the equipment an item may be: a server rack, a generator, a pump, a tank, a fixed
 * seat, a pew, an altar, a fume cupboard, a lab bench, a safety shower, a kennel, an exam table, a
 * clinical sink, and `equipment`, any other thing, drawn as a plain box at the size and height it
 * is given and called by its label. Equipment is a fixture: it takes the floor it stands on.
 */
export const EQUIPMENT_KINDS = ['rack', 'generator', 'pump', 'tank', 'seat', 'pew', 'altar', 'fume-cupboard', 'lab-bench', 'safety-shower', 'kennel', 'exam-table', 'clinical-sink', 'equipment'] as const

/**
 * The kinds Grid holds itself, fixtures first. Another kind is added through the kinds registry
 * (`registerItemKind` in `geometry/itemKinds.ts`), never by adding to this list alone.
 */
/**
 * CNT-52 (C30): the things an item may be that stand at a point: an extinguisher, a defibrillator
 * (`aed`), a fire alarm call point, a first aid point, a sensor, a desk position (`desk-point`;
 * `desk` is the furniture), a game's spawn point and a camera, then the fire and wayfinding set:
 * you are here, a hose reel, a fire door's mark, an exit, a refuge and an assembly point. A point
 * takes no floor and is in no item's way; its `size` is the size its symbol is drawn at and its
 * `height` the height it is shown at.
 */
export const POINT_KINDS = ['extinguisher', 'aed', 'call-point', 'first-aid', 'sensor', 'desk-point', 'spawn', 'camera', 'you-are-here', 'hose-reel', 'fire-door', 'exit', 'refuge', 'assembly-point'] as const

export const ITEM_KINDS = [...FIXTURE_KINDS, ...FURNITURE_KINDS, ...EQUIPMENT_KINDS, ...POINT_KINDS] as const

export type ItemKind = (typeof ITEM_KINDS)[number]

/**
 * CNT-20 (C30): set by `withLibrary` on an item, the values it took from its library entry, so
 * that its schema records them in `fromLibrary`. A symbol, so no file can write it.
 */
const FROM_LIBRARY = Symbol('values from its library entry')

/** CNT-20: the values of an item that its library entry may fill, and `fromLibrary` may name. */
export const LIBRARY_VALUES = ['kind', 'size', 'height', 'clearance', 'label'] as const
export type LibraryValue = (typeof LIBRARY_VALUES)[number]

/** CNT-20 (C30): an item's own `fromLibrary` from what `withLibrary` marked; a file's own is not read. */
function withItemFromLibrary(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const filled = (raw as Record<symbol, unknown>)[FROM_LIBRARY]
  const record = raw as Record<string, unknown>
  if (!Object.hasOwn(record, 'fromLibrary') && !(Array.isArray(filled) && filled.length > 0)) return raw
  const item: Record<string, unknown> = { ...record }
  delete item.fromLibrary
  if (Array.isArray(filled) && filled.length > 0) item.fromLibrary = filled
  return item
}

/**
 * CNT-20 (C30): a named size in a library: a kind, its footprint (width along its back, depth to
 * its front), its height and the clear floor it keeps in front of it, all in metres. `source`
 * says where the size comes from: the document, its edition and clause, or the office's own
 * words. Grid's built-in entries are its own sizes, not a code's (`library/builtIn.ts`).
 */
export const LibraryItemSchema = z.object({
  name: text('id'),
  kind: text('id'),
  size: z.tuple([finite().positive(), finite().positive()]),
  height: finite().positive(),
  clearance: finite().nonnegative().optional(),
  label: text('name').optional(),
  source: text('name').optional(),
})

/**
 * CNT-12 (C6): a fixture placed on a floor. It is never a wall and never a room: it adds no
 * floor area, closes no room and takes no part in a room's outline.
 *
 * `at` is the middle of its footprint on the plan. `size` is its width, along its back, and its
 * depth, from its back to its front. Unturned, its back faces -Y (down the 2D view) and its front
 * +Y; `turn` turns it counter-clockwise about `at`, in degrees. `height` is from the floor of the
 * room it stands in to its top. Every figure is the author's: Grid gives a fixture no size of its
 * own. `kind` is read as written, so a kind this version does not hold (a table) is left out with
 * a note (`item/unknown-kind`) instead of refusing the whole plan.
 */
export const ItemSchema = z.preprocess(
  withItemFromLibrary,
  z.object({
    id: text('id'),
    kind: text('id'),
    at: Vec2,
    size: z.tuple([finite().positive(), finite().positive()]),
    height: finite().positive(),
    // Optional and never defaulted: unstated, the item is not turned.
    turn: finite().optional(),
    // What the drawing and an export call it: "WC", "Island". Unstated, its kind.
    label: text('name').optional(),
    // C5: unstated means the ground floor.
    floor: text('id').pipe(z.string().min(1)).optional(),
    // CNT-20 (C30): the library entry it was placed from, by name: the plan's own `library`,
    // else Grid's built-in one. The entry fills what the item leaves out (`withLibrary`).
    library: text('id').optional(),
    // CNT-20 (C30): metres of clear floor kept in front of it, as wide as it is. Optional and
    // never defaulted: unstated, nothing is kept clear and nothing checks it.
    clearance: finite().nonnegative().optional(),
    // CNT-47 (C30): metres of clear floor kept behind it (as wide as it is) and at its left and
    // right (as deep as it is): its own left, facing out of its front, the side its width starts from. Each optional and never
    // defaulted: unstated, nothing is kept clear there.
    clearSides: z
      .object({ back: finite().nonnegative().optional(), left: finite().nonnegative().optional(), right: finite().nonnegative().optional() })
      .strict()
      .optional(),
    // CNT-52 (C9): facts of the person's own: an extinguisher's type, a sensor's address.
    properties: PropertiesSchema.optional(),
    // CNT-20: what its library entry filled in (`withLibrary`). Grid's reading only, never written back.
    fromLibrary: z.array(z.enum(LIBRARY_VALUES)).optional(),
  })
)

/**
 * SHT-7: what writing on the drawing can be. A `note` is text, a `tag` short text in a box, a
 * `symbol` one of `ANNOTATION_SYMBOLS`, and a `key` the drawing's key, listing what it shows.
 */
export const ANNOTATION_KINDS = ['note', 'tag', 'symbol', 'key'] as const
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number]

/** SHT-7: the symbols a drawing can carry: a north arrow, and the way in. */
export const ANNOTATION_SYMBOLS = ['north', 'entrance'] as const

/**
 * SHT-7: writing on the drawing. It is drawn and exported as text, and never measured or checked.
 *
 * It is placed at a point (`at`, in plan metres) or in a room (`room`, by id: under the room's
 * name), never both; a key placed by neither goes under the drawing. `floor` is the floor a note
 * placed at a point is on (C5: unstated, the ground floor); a note in a room is on its room's.
 * `turn` turns a symbol, in degrees counter-clockwise: a north arrow points up the drawing when
 * unturned. One object for every kind, so a field the format does not have is named (MSG-4).
 */
export const AnnotationSchema = z
  .object({
    id: text('id'),
    kind: z.enum(ANNOTATION_KINDS),
    text: text('name').optional(),
    symbol: z.enum(ANNOTATION_SYMBOLS).optional(),
    at: Vec2.optional(),
    room: text('id').optional(),
    floor: text('id').pipe(z.string().min(1)).optional(),
    turn: finite().optional(),
  })
  .superRefine((note, ctx) => {
    const say = (message: string, path: string): void => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] })
    if (note.at !== undefined && note.room !== undefined) say('is placed both at a point and in a room: give one, at or room', 'room')
    if ((note.kind === 'note' || note.kind === 'tag') && (note.text === undefined || note.text.trim() === '')) say(`a ${note.kind} needs its text`, 'text')
    if (note.kind === 'symbol' && note.symbol === undefined) say(`a symbol needs which one: ${ANNOTATION_SYMBOLS.join(' or ')}`, 'symbol')
    if (note.kind !== 'key' && note.at === undefined && note.room === undefined) say(`a ${note.kind} needs a place: at, a point, or room, a room's id`, 'at')
  })

/** SHT-7: what a sketch item is: a line through points, an arc, a rectangle, a closed shape, or text. */
export const SKETCH_KINDS = ['line', 'arc', 'rect', 'shape', 'text'] as const
export type SketchKind = (typeof SKETCH_KINDS)[number]

/**
 * SHT-7: a sketch item, drawn in every plan view and exported on a layer of its own, and never
 * measured, checked or taken as a wall, a room or anything Grid understands: a garden, a street,
 * a fence, a hatch, an option's outline.
 *
 * `category` is the author's word for what it is ("garden", "street"): it names its layer in an
 * export and its entry in the key. `points` for a line (two or more) and a shape (three or
 * more); `from` and `to`, two opposite corners, for a rect; `at`, `radius`, `start` and `end`
 * (degrees counter-clockwise from +X, the arc running counter-clockwise) for an arc; `at` and
 * `text` for text. `floor`: C5, unstated is the ground floor.
 */
export const SketchItemSchema = z
  .object({
    id: text('id'),
    kind: z.enum(SKETCH_KINDS),
    category: text('id').pipe(z.string().min(1)),
    floor: text('id').pipe(z.string().min(1)).optional(),
    points: z.array(Vec2).max(BOUNDARY_MAX).optional(),
    from: Vec2.optional(),
    to: Vec2.optional(),
    at: Vec2.optional(),
    radius: finite().positive().optional(),
    start: finite().optional(),
    end: finite().optional(),
    text: text('name').optional(),
  })
  .superRefine((item, ctx) => {
    const need = (ok: boolean, message: string, path: string): void => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `a sketch ${item.kind} needs ${message}`, path: [path] })
    }
    if (item.kind === 'line') need((item.points?.length ?? 0) >= 2, 'points, two or more', 'points')
    if (item.kind === 'shape') need((item.points?.length ?? 0) >= 3, 'points, three or more', 'points')
    if (item.kind === 'rect') {
      need(item.from !== undefined, 'from, one corner', 'from')
      need(item.to !== undefined, 'to, the opposite corner', 'to')
    }
    if (item.kind === 'arc') {
      need(item.at !== undefined, 'at, its centre', 'at')
      need(item.radius !== undefined, 'radius', 'radius')
      need(item.start !== undefined && item.end !== undefined, 'start and end, in degrees', 'start')
    }
    if (item.kind === 'text') {
      need(item.at !== undefined, 'at, where the text goes', 'at')
      need(item.text !== undefined && item.text.trim() !== '', 'its text', 'text')
    }
  })

/** CNT-3 (C7): which way +Y runs on the drawing, with +X to the right. `up` is C4. */
export const Y_AXES = ['up', 'down'] as const
export type YAxis = (typeof Y_AXES)[number]

/**
 * CNT-3 (C7): the front of the building: the outside face of a wall, or of the wall an opening
 * (the front door) is in. Exactly one of the two.
 */
export const FrontSchema = z
  .object({
    wall: text('id').pipe(z.string().min(1)).optional(),
    opening: text('id').pipe(z.string().min(1)).optional(),
  })
  .superRefine((front, ctx) => {
    if ((front.wall === undefined) === (front.opening === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wall'], message: 'names the front by one part: wall, a wall\'s id, or opening, an opening\'s id' })
    }
  })

/**
 * BRF-3 (C13): what the site holds on the ground: fences, gates, paths, paving, trees and pools.
 * Each kind is the site's own, never a wall, a room or a fixture: it adds no wall, no area, no
 * note and no storey height, and is drawn in its own style on the ground floor's plan.
 */
export const SITE_THING_KINDS = ['fence', 'gate', 'path', 'paving', 'tree', 'pool'] as const
export type SiteThingKind = (typeof SITE_THING_KINDS)[number]

/**
 * BRF-3 (C13): one thing on the site. A `fence` is a line through `points` (two or more), a
 * `gate` the line between its two posts (two points), a `path` a line (two or more) with its
 * `width`, `paving` and a `pool` a closed shape (three or more points), and a `tree` its trunk
 * `at` a point, with the `canopy` across its crown if known. `height` (a fence's, a gate's, a
 * tree's) is drawn only: it is never a storey's or a roof's. `label` is the person's word for it.
 */
export const SiteThingSchema = z
  .object({
    id: text('id').pipe(z.string().min(1)),
    kind: z.enum(SITE_THING_KINDS),
    points: z.array(Vec2).max(BOUNDARY_MAX).optional(),
    at: Vec2.optional(),
    width: finite().positive().optional(),
    canopy: finite().positive().optional(),
    height: finite().positive().optional(),
    label: text('name').optional(),
  })
  .superRefine((thing, ctx) => {
    const need = (ok: boolean, message: string, path: string): void => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `a ${thing.kind} needs ${message}`, path: [path] })
    }
    const points = thing.points?.length ?? 0
    if (thing.kind === 'fence') need(points >= 2, 'points, two or more, along its line', 'points')
    if (thing.kind === 'gate') need(points === 2, 'points, its two posts', 'points')
    if (thing.kind === 'path') {
      need(points >= 2, 'points, two or more, along its middle', 'points')
      need(thing.width !== undefined, 'its width', 'width')
    }
    if (thing.kind === 'paving' || thing.kind === 'pool') need(points >= 3, 'points, three or more, round its edge', 'points')
    if (thing.kind === 'tree') need(thing.at !== undefined, 'at, where its trunk stands', 'at')
  })

/** BRF-3: who a set-back is from, in WRT-6's words (`MARK_SOURCES`): `given` by the person, or `assumed`, for them to confirm. */
export const SETBACK_SOURCES = ['given', 'assumed'] as const

/**
 * BRF-3 (C13): a set-back the person asked for: how far the building is to stand `from` the
 * boundary: `all` its edges, the `street` edges, or one edge by its number. A figure of the
 * person's own, never a code's: Grid compares the drawing with it and applies no figure of its
 * own. `source` says whether the person gave it or it was assumed for them to confirm.
 */
export const SetbackSchema = z.object({
  from: z.union([z.enum(['all', 'street']), z.number().int().min(1)]),
  distance: finite().min(0),
  source: z.enum(SETBACK_SOURCES).optional(),
})

/** CNT-49 (C7): the eight compass points of the drawing a fall runs toward, north up it (C4). */
export const FALL_TOWARD = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const
export type FallToward = (typeof FALL_TOWARD)[number]

/** CNT-49 (C7): the ground at the building's sides, each a level from the ground floor's floor level. */
export const GroundSidesSchema = z
  .object({ north: finite().optional(), east: finite().optional(), south: finite().optional(), west: finite().optional() })
  .refine((sides) => Object.values(sides).some((v) => v !== undefined), { message: 'names no side: give a level for north, east, south or west' })

/** CNT-49 (C7): a fall of the ground, `slope` in percent, falling `toward` a compass point of the drawing. */
export const GroundFallSchema = z.object({ slope: finite().min(0).max(1000), toward: z.enum(FALL_TOWARD) })

/** CNT-49 (C7): the ground along an edge of the plot: its level at the edge's first corner and its second. */
export const GroundEdgeSchema = z.object({ edge: z.number().int().min(1), start: finite(), end: finite().optional() })

/**
 * BRF-3: how many edges a boundary has: one per point, the last running back to the first. A
 * last point written on the first again closes the shape and adds no edge.
 */
export function boundaryEdgeCount(points: readonly (readonly [number, number])[]): number {
  const first = points[0]
  const last = points.at(-1)
  const closed = points.length > 1 && first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1]
  return closed ? points.length - 1 : points.length
}

/**
 * CNT-3 (C7): where the building sits. `origin` is a point of the plan, in metres; `latitude` and
 * `longitude` (degrees, north and east positive, given together) and `elevation` (metres above
 * sea level) say where that point is on the earth. Each is optional, and a field Grid does not
 * hold is named (MSG-4); nothing is placed on the earth until `origin` is stated.
 *
 * HND-11 (lab MS-12): a plan may keep survey or map coordinates as they are and state, as
 * `origin`, a point near the building: the far-from-origin check measures from it, and every export
 * writes the geometry from it, near zero, with the origin as its offset.
 *
 * LVL-4: `ground` is the level of the ground outside, in metres from the ground floor's floor
 * level (0), the same datum as a floor's `elevation` (not `site.elevation`, which is above sea
 * level): -0.15 for a floor 15 cm above the ground. It needs no `origin`. With it stated, a door
 * or window in an outside wall that lies below the ground is named, and the ground floor is the
 * floor nearest it.
 *
 * CNT-49: the ground on a slope, in the same datum. `groundSides` gives the ground at any of the
 * building's four sides (C4: north is up the drawing, as the facades name them); `fall` a slope,
 * in percent (rise over run, times 100), falling `toward` a compass point of the drawing, through
 * `ground` (else 0) at the middle of the building; `groundEdges` the ground along edges of the
 * plot, at the edge's first corner (`start`) and its second (`end`, else the same). Every check,
 * the site measure and the pictures read the ground at each wall from the one even slope that fits
 * them all (`geometry/groundSurface.ts`).
 *
 * BRF-3 (C13): `boundary`, `streets`, `setbacks` and `things`, the plot and what is on it.
 * A fault in one street, set-back or thing leaves that one out alone (`readParts.ts`).
 *
 * CNT-50: `address` and `name`, the site's address and its own name ("Harbour House") as the
 * person gives them, free text kept as written. Grid never looks an address up: `latitude` and
 * `longitude` are the only place on the earth it reads.
 */
export const SiteSchema = z
  .object({
    origin: Vec2.optional(),
    latitude: finite().min(-90).max(90).optional(),
    longitude: finite().min(-180).max(180).optional(),
    elevation: finite().optional(),
    ground: finite().optional(),
    // COD-3: the country the building will be built in, by its name or its two- or three-letter
    // code (ISO 3166-1), as Grid's list (`places.ts`) has it. It picks the figures the checks
    // apply; with none stated, no figure is applied. Kept as written; a report names the place
    // from the list, never from this text.
    country: placeText().optional(),
    // CNT-50: the site's address and its own name, in the person's words, never looked up.
    address: text('name').pipe(z.string().min(1)).optional(),
    name: text('name').pipe(z.string().min(1)).optional(),
    // BRF-3 (C13): the plot's boundary, its corners in plan metres, in order round it; edge 1
    // runs from the first point to the second, and the last edge back to the first point.
    boundary: z.array(Vec2).min(3).max(BOUNDARY_MAX).optional(),
    // BRF-3: the edges of the boundary that are on a street, by number.
    streets: z.array(z.number().int().min(1)).max(BOUNDARY_MAX).optional(),
    // BRF-3: the set-backs the person asked for, their own figures.
    setbacks: z.array(SetbackSchema).max(BOUNDARY_MAX).optional(),
    // BRF-3: the site's own things: fences, gates, paths, paving, trees and pools.
    things: z.array(SiteThingSchema).max(PARTS_MAX).optional(),
    // CNT-49: the ground at the building's sides, a fall, and the ground along edges of the plot.
    groundSides: GroundSidesSchema.optional(),
    fall: GroundFallSchema.optional(),
    groundEdges: z.array(GroundEdgeSchema).max(BOUNDARY_MAX).optional(),
  })
  .superRefine((site, ctx) => {
    const say = (path: (string | number)[], message: string): void => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })
    if ((site.latitude === undefined) !== (site.longitude === undefined)) {
      say([site.latitude === undefined ? 'latitude' : 'longitude'], 'needs latitude and longitude together: one alone places nothing')
    }
    const edges = site.boundary === undefined ? 0 : boundaryEdgeCount(site.boundary)
    if (site.boundary !== undefined && edges < 3) say(['boundary'], 'has fewer than three corners once its last point, which closes it, is set aside')
    const edgeProblem = (edge: number): string | null =>
      site.boundary === undefined ? 'names an edge, but the site states no boundary' : edge > edges ? `names edge ${edge}, but the boundary has ${edges} edges` : null
    const streets = new Set<number>()
    site.streets?.forEach((edge, i) => {
      const problem = edgeProblem(edge)
      if (problem !== null) say(['streets', i], problem)
      else if (streets.has(edge)) say(['streets', i], `names edge ${edge} twice`)
      else streets.add(edge)
    })
    const asked = new Set<string>()
    site.setbacks?.forEach((setback, i) => {
      const key = String(setback.from)
      const problem = typeof setback.from === 'number' ? edgeProblem(setback.from) : setback.from === 'street' && streets.size === 0 ? 'is from the street, but the site names no street edge' : site.boundary === undefined ? 'is from the boundary, but the site states no boundary' : null
      if (problem !== null) say(['setbacks', i, 'from'], problem)
      else if (asked.has(key)) say(['setbacks', i, 'from'], `asks a second set-back from ${typeof setback.from === 'number' ? `edge ${key}` : key === 'all' ? 'every edge' : 'the street'}: give one`)
      else asked.add(key)
    })
    // CNT-49: a ground edge is an edge of the boundary, named once.
    const leveled = new Set<number>()
    site.groundEdges?.forEach((g, i) => {
      const problem = edgeProblem(g.edge)
      if (problem !== null) say(['groundEdges', i, 'edge'], problem)
      else if (leveled.has(g.edge)) say(['groundEdges', i, 'edge'], `names edge ${g.edge} twice`)
      else leveled.add(g.edge)
    })
    const ids = new Set<string>()
    site.things?.forEach((thing, i) => {
      if (ids.has(thing.id)) say(['things', i, 'id'], 'is the id of another of the site\'s things: give each its own')
      ids.add(thing.id)
    })
  })

/**
 * WRT-6 (lab WR-15, AE-4): where a value came from. `given` by the person, `measured` (taped or
 * lasered), `scanned` (from a capture of the building) or `assumed` by whoever wrote the plan.
 */
export const MARK_SOURCES = ['given', 'measured', 'scanned', 'assumed'] as const
export type MarkSource = (typeof MARK_SOURCES)[number]

/** WRT-6: the parts a mark can be on, and the values of each it can name. */
export const MARKED_VALUES = {
  wall: ['start', 'end', 'thickness', 'height', 'kind'],
  room: ['name', 'use', 'height', 'floorOffset'],
  opening: ['type', 'offset', 'width', 'height', 'sill', 'hinge', 'swing'],
  floor: ['name', 'level', 'elevation', 'height', 'slab'],
  item: ['kind', 'at', 'size', 'height', 'turn'],
} as const satisfies Record<string, readonly string[]>
export type MarkedPart = keyof typeof MARKED_VALUES
export const MARKED_PARTS = Object.keys(MARKED_VALUES) as MarkedPart[]

/** The values a mark's tolerance can be on: lengths. A word (a kind, a use, a name) has none. */
export const MARKED_LENGTHS: ReadonlySet<string> = new Set(['start', 'end', 'thickness', 'height', 'floorOffset', 'offset', 'width', 'sill', 'elevation', 'slab', 'at', 'size'])

/**
 * WRT-6: a mark on one value of one part, or on the part as a whole (no `value`): where it came
 * from and, where that matters, how sure it is. `tolerance` is in metres, give or take, on each
 * length the mark covers: a scanned wall within 0.02 m. A mark on a value wins over a mark on its
 * part. The marks are one list beside the parts, so no part and no number changes shape: a plan
 * with none reads exactly as before. Optional and never defaulted (version 1).
 */
export const MarkSchema = z
  .object({
    part: z.enum(MARKED_PARTS as [MarkedPart, ...MarkedPart[]]),
    id: text('id').pipe(z.string().min(1)),
    value: text('id').pipe(z.string().min(1)).optional(),
    source: z.enum(MARK_SOURCES),
    tolerance: finite().positive().optional(),
  })
  .superRefine((mark, ctx) => {
    const values: readonly string[] = MARKED_VALUES[mark.part]
    if (mark.value !== undefined && !values.includes(mark.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: `names a value a ${mark.part} mark cannot be on: one of ${values.join(', ')}, or none for the whole ${mark.part}` })
    }
    if (mark.tolerance !== undefined && mark.value !== undefined && !MARKED_LENGTHS.has(mark.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tolerance'], message: `is on ${mark.value}, which is not a length: a tolerance is in metres, on a length` })
    }
  })

/** C11: a point in plan metres, z up from the ground floor's floor level. */
const Vec3 = z.tuple([finite(), finite(), finite()])

/** VEW-3 (C11): what a saved view's bearing is read from. */
export const VIEW_BEARING_FROM = ['north', 'plan up'] as const

/**
 * VEW-3 (C11): a named view, saved with the plan. The setting (`target` to `cut`) is what Grid
 * reads; `floors` and the BCF camera (`position` to `aspectRatio`) are what it worked out, for
 * other programs. Optional and never defaulted (version 1).
 */
export const ViewSchema = z
  .object({
    name: text('name').pipe(z.string().min(1)),
    target: z.object({
      room: text('id').pipe(z.string().min(1)).optional(),
      point: Vec3,
    }),
    bearing: finite().min(0).lt(360),
    bearingFrom: z.enum(VIEW_BEARING_FROM),
    north: finite().optional(),
    tilt: finite(),
    distance: finite(),
    lens: z.object({
      focalLength: finite(),
      sensor: z.object({ width: finite().positive(), height: finite().positive() }),
    }),
    cut: text('id').pipe(z.string().min(1)).optional(),
    floors: parts(text('id'), 'floors').optional(),
    position: Vec3,
    direction: Vec3,
    up: Vec3,
    fieldOfView: finite().positive().lt(180),
    aspectRatio: finite().positive(),
  })
  .superRefine((view, ctx) => {
    const most = limit('cameraTilt')
    if (Math.abs(view.tilt) > most) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tilt'], message: `is more than ${most} degrees from level: a camera looking straight down or up has no up` })
    if (!(view.distance >= limit('cameraClosest'))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['distance'], message: `is less than ${limit('cameraClosest')} m, the least distance a camera may stand from what it is pointed at` })
    const [shortest, longest] = [limit('lensShortest'), limit('lensLongest')]
    if (!(view.lens.focalLength >= shortest && view.lens.focalLength <= longest)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lens', 'focalLength'], message: `takes a focal length from ${shortest} to ${longest} mm` })
    if (view.bearingFrom === 'north' && view.north === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['north'], message: 'is needed when the bearing is from north: the north it was read from' })
  })

/**
 * HND-11 (C15, lab WR-14): a length taped on site, kept beside the drawing as a check. `room` is
 * the room it was taped in; then either `wall`, the room's side along that wall (its inside face,
 * corner to corner), or `from` and `to`, two corners of the room, each named by the two walls
 * that meet there (a diagonal, or any corner to corner). `length` is the length taped, in
 * metres; `tolerance`, how far the drawing may be from it and still agree (unstated,
 * `tapedAgree`). `id` is optional, for the person's own reference. Nothing is drawn or placed
 * from it: every run says it taped against drawn.
 */
export const TapedSchema = z
  .object({
    id: text('id').pipe(z.string().min(1)).optional(),
    room: text('id').pipe(z.string().min(1)),
    wall: text('id').pipe(z.string().min(1)).optional(),
    from: z.tuple([text('id').pipe(z.string().min(1)), text('id').pipe(z.string().min(1))]).optional(),
    to: z.tuple([text('id').pipe(z.string().min(1)), text('id').pipe(z.string().min(1))]).optional(),
    length: finite().positive(),
    tolerance: finite().positive().optional(),
  })
  .superRefine((taped, ctx) => {
    const corners = taped.from !== undefined || taped.to !== undefined
    if (taped.wall !== undefined && corners) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wall'], message: 'names a side and corners at once: give wall, or from and to' })
    } else if (taped.wall === undefined && !corners) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wall'], message: 'says neither what was taped along nor between: give wall, the side along that wall, or from and to, two corners' })
    } else if (corners && (taped.from === undefined || taped.to === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [taped.from === undefined ? 'from' : 'to'], message: 'needs both corners, from and to, each named by the two walls that meet there' })
    }
  })

/**
 * CNT-17 (C14): a route that needs to be accessible: `to` a room, by id, and `from` a room or,
 * unstated, from the entrance (the front door the plan names, else its doors to the outside on
 * the ground floor).
 */
export const AccessibleRouteSchema = z.object({
  from: text('id').pipe(z.string().min(1)).optional(),
  to: text('id').pipe(z.string().min(1)),
})

/**
 * CNT-17 (C14): the rooms and routes that need to be accessible. A mark of what is needed, never
 * a finding. Optional and never defaulted (version 1).
 */
export const AccessibleSchema = z.object({
  rooms: parts(text('id').pipe(z.string().min(1)), 'rooms').optional(),
  routes: parts(AccessibleRouteSchema, 'routes').optional(),
})

/**
 * CNT-4 (C18): a kind of flat, stated once and placed many times: an id the flats name in their
 * `type`, and a name to read it by ("One bedroom"). Optional and never defaulted (version 1).
 */
export const FlatTypeSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  name: text('name').optional(),
})

/**
 * CNT-4 (C18): a flat (a dwelling, a unit): an id, a name, the type it is (an id in `flatTypes`),
 * its rooms by id (on one floor or several: a duplex), and whether it is its type's mirror image.
 * A group of rooms, never a room. Optional and never defaulted (version 1).
 */
export const FlatSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  name: text('name').optional(),
  type: text('id').pipe(z.string().min(1)).optional(),
  rooms: parts(text('id').pipe(z.string().min(1)), 'rooms').pipe(z.array(z.string()).min(1, { message: 'A flat lists at least one room' })),
  mirrored: z.boolean().optional(),
})

/** CNT-15 (C24): the one word a wall type's height may be instead of metres: as high as a wall on its floor that states none. */
export const WALL_TYPE_HEIGHTS = ['floor'] as const

/** CNT-15: a material, by the person's own name for it ("Brick", "Glass", "Limestone"). */
const materialName = () => text('name').pipe(z.string().refine((value) => value.trim().length > 0, { message: 'is blank: leave the material out instead' }))

/**
 * CNT-15 (C24): a named wall type. It fills what a wall that names it leaves out: its thickness,
 * its height (metres, or `floor`: as high as a wall on its floor that states none) and its kind.
 * `glazed` says the wall is glass (a glazed partition, a curtain wall); `material` is what it is
 * made of, which the IFC writes, as one layer. Layered build-ups are not held.
 */
export const WallTypeSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  name: text('name').pipe(z.string().min(1)),
  thickness: finite().positive().optional(),
  height: z.union([finite().positive(), z.enum(WALL_TYPE_HEIGHTS)]).optional(),
  kind: WallKindSchema.optional(),
  glazed: z.boolean().optional(),
  material: materialName().optional(),
})

/**
 * CNT-15 (C24): a named door type. It fills what a door that names it leaves out: its width and
 * height (the hole in the wall, as a door states them), its kind (C20) and the part that opens.
 */
export const DoorTypeSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  name: text('name').pipe(z.string().min(1)),
  width: finite().positive().optional(),
  height: finite().positive().optional(),
  kind: z.enum(DOOR_KINDS).optional(),
  opens: OpeningPartSchema.optional(),
  glazed: z.boolean().optional(),
  material: materialName().optional(),
})

/** CNT-15 (C24): a named window type: a door type's fields, a window's kinds, and its sill. */
export const WindowTypeSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  name: text('name').pipe(z.string().min(1)),
  width: finite().positive().optional(),
  height: finite().positive().optional(),
  sill: finite().nonnegative().optional(),
  kind: z.enum(WINDOW_KINDS).optional(),
  opens: OpeningPartSchema.optional(),
  glazed: z.boolean().optional(),
  material: materialName().optional(),
})

const typeId = () => text('id').pipe(z.string().min(1))

/**
 * CNT-15 (C24): the types a part takes when it names none: a wall by its kind (unstated, the
 * kind a wall reads as, interior), a door and a window. The template an office keeps.
 */
export const TypeDefaultsSchema = z.object({
  walls: z.object(Object.fromEntries(WallKindSchema.options.map((kind) => [kind, typeId().optional()])) as Record<WallKind, z.ZodOptional<ReturnType<typeof typeId>>>).optional(),
  door: typeId().optional(),
  window: typeId().optional(),
})

/** CNT-15 (C24): the plan's named types, and the defaults. */
export const PartTypesSchema = z.object({
  walls: parts(WallTypeSchema, 'wall types').optional(),
  doors: parts(DoorTypeSchema, 'door types').optional(),
  windows: parts(WindowTypeSchema, 'window types').optional(),
  defaults: TypeDefaultsSchema.optional(),
})

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** CNT-15: the types of one list that the schema reads, by id; the first of an id wins, as `validatePlan` says. */
function typesById<T extends { id: string }>(list: unknown, schema: z.ZodType<T>): Map<string, T> {
  const out = new Map<string, T>()
  if (!Array.isArray(list)) return out
  for (const entry of list) {
    const read = schema.safeParse(entry)
    if (read.success && !out.has(read.data.id)) out.set(read.data.id, read.data)
  }
  return out
}

/**
 * CNT-15 (C24): each wall, door and window filled from its type, done on the file as read before
 * anything else, so every reader sees a wall's thickness and a door's size wherever they came from.
 * A value the part states is kept; what the type filled is marked (`FROM_TYPE`), and the part's
 * schema records it in `typed`. A part that names no type takes the default for it, and its type's
 * id is then filled too. A type that cannot be read, or an id no type has, fills nothing, and
 * `validatePlan` says so. A dividing line takes no type. An opening pattern's opening is filled the
 * same way, so every opening it makes is.
 */
export function withTypes(raw: unknown): unknown {
  if (!isRecord(raw) || !isRecord(raw['types'])) return raw
  const types = raw['types']
  const walls = typesById(types['walls'], WallTypeSchema)
  const doors = typesById(types['doors'], DoorTypeSchema)
  const windows = typesById(types['windows'], WindowTypeSchema)
  const read = TypeDefaultsSchema.safeParse(types['defaults'])
  const defaults = read.success ? read.data : {}
  if (walls.size === 0 && doors.size === 0 && windows.size === 0) return raw
  const out: Record<string, unknown> = { ...raw }
  if (Array.isArray(raw['walls']) && walls.size > 0) {
    out['walls'] = raw['walls'].map((wall) => {
      if (!isRecord(wall) || (wall as Record<symbol, unknown>)[FROM_TYPE] !== undefined || wall['virtual'] === true) return wall
      const named = typeof wall['wallType'] === 'string' ? wall['wallType'] : undefined
      const kind = typeof wall['kind'] === 'string' && (WallKindSchema.options as readonly string[]).includes(wall['kind']) ? (wall['kind'] as WallKind) : 'interior'
      const id = named ?? defaults.walls?.[kind]
      const type = id === undefined ? undefined : walls.get(id)
      if (type === undefined) return wall
      const filled: TypedValue[] = []
      const next: Record<string | symbol, unknown> = { ...wall }
      const fill = (key: TypedValue, value: unknown): void => {
        if (value === undefined || wall[key] !== undefined) return
        next[key] = value
        filled.push(key)
      }
      fill('wallType', type.id)
      fill('thickness', type.thickness)
      fill('height', typeof type.height === 'number' ? type.height : undefined)
      fill('kind', type.kind)
      next[FROM_TYPE] = filled
      return next
    })
  }
  const fillOpening = (opening: Record<string, unknown>, mark: boolean): Record<string, unknown> => {
    const door = opening['type'] === 'door'
    const window = opening['type'] === 'window'
    if (!door && !window) return opening
    const field = door ? 'doorType' : 'windowType'
    const named = typeof opening[field] === 'string' ? (opening[field] as string) : undefined
    const id = named ?? (door ? defaults.door : defaults.window)
    const type = id === undefined ? undefined : door ? doors.get(id) : windows.get(id)
    if (type === undefined) return opening
    // CNT-39: a part that names no type and states every size its default type would fill is not
    // of that type: it stays as it is, so a schedule never lists it as one.
    if (named === undefined && ['width', 'height', 'sill'].every((size) => !(size in type) || type[size as 'width'] === undefined || opening[size] !== undefined)) return opening
    const filled: TypedValue[] = []
    const next: Record<string | symbol, unknown> = { ...opening }
    const fill = (key: TypedValue, value: unknown): void => {
      if (value === undefined || opening[key] !== undefined) return
      next[key] = value
      filled.push(key)
    }
    fill(field, type.id)
    fill('width', type.width)
    fill('height', type.height)
    if ('sill' in type) fill('sill', type.sill)
    fill('kind', type.kind)
    fill('opens', type.opens)
    if (mark) next[FROM_TYPE] = filled
    return next
  }
  if (Array.isArray(raw['openings']) && (doors.size > 0 || windows.size > 0)) {
    out['openings'] = raw['openings'].map((opening) => (!isRecord(opening) || (opening as Record<symbol, unknown>)[FROM_TYPE] !== undefined ? opening : fillOpening(opening, true)))
  }
  if (Array.isArray(raw['patterns']) && (doors.size > 0 || windows.size > 0)) {
    out['patterns'] = raw['patterns'].map((pattern) => (!isRecord(pattern) || !isRecord(pattern['opening']) ? pattern : { ...pattern, opening: fillOpening(pattern['opening'], false) }))
  }
  return out
}

/**
 * CNT-6 (C23): a building of the plan: an id, a name, and the floors that are its own, by id. A
 * floor is in one building at most; a floor no building names is in none. A named group of
 * floors, never a floor: each building stacks its own floors, from its `pad` when it states one
 * (LVL-23), and has its own areas, ground floor and height (`geometry/buildings.ts`). Ids that are
 * no floor are named and left out, never refused.
 */
export const PlanBuildingSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  name: text('name').optional(),
  floors: parts(text('id').pipe(z.string().min(1)), 'floors').pipe(z.array(z.string()).min(1, { message: english(said('read.building.floors')) })),
  // LVL-23: the level of the building's own ground, in metres from the plan's datum (0). Optional
  // and never defaulted: unstated, its ground is the site's, else its own ground floor's level.
  pad: finite().optional(),
})

/**
 * CNT-6 (C23): a shape drawn round the plan for context: a neighbour's house, the hall a stand
 * stands in. Its outline's corners in plan metres, in order round it, either way round, on a floor
 * (unstated, the ground floor), with a name and a height. Drawn only: it is never a wall or a room,
 * and is in no measure, check or count.
 */
export const ContextShapeSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  name: text('name').optional(),
  floor: text('id').pipe(z.string().min(1)).optional(),
  points: z
    .array(Vec2)
    .min(3)
    .max(BOUNDARY_MAX)
    .superRefine((points, ctx) => {
      const open = boundaryEdgeCount(points) === points.length ? points : points.slice(0, -1)
      const problem = ringProblem(open.map(([x, y]) => ({ x, y })))
      if (problem !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `is not an outline: ${problem}` })
    }),
  height: finite().positive().optional(),
})

/** CNT-16 (C25): the shapes a column may be. */
export const COLUMN_SHAPES = ['square', 'round'] as const
export type ColumnShape = (typeof COLUMN_SHAPES)[number]

/**
 * CNT-16 (C25): a column, a thing of its own: never a wall, a room or a fixture. `width` is a
 * square column's side along its own x and a round one's diameter; `depth` a square column's side
 * along its own y (unstated, as wide). `at` is its middle, `turn` turns a square one about it in
 * degrees, counter-clockwise. It stands on `floor` (C5: unstated, the ground floor) and may rise
 * `through` floors above it, as a wall does (C19). `height` is how high it stands above the floor
 * it rises through; unstated, it is that floor's storey height. `label` is what the drawing and
 * an export call it.
 */
export const ColumnSchema = z
  .object({
    id: text('id').pipe(z.string().min(1)),
    shape: z.enum(COLUMN_SHAPES),
    width: finite().positive(),
    depth: finite().positive().optional(),
    at: Vec2,
    turn: finite().optional(),
    height: finite().positive().optional(),
    floor: text('id').pipe(z.string().min(1)).optional(),
    through: text('id').pipe(z.string().min(1)).optional(),
    label: text('name').optional(),
  })
  .superRefine((column, ctx) => {
    if (column.shape === 'round' && column.depth !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['depth'], message: english(said('read.column.roundDepth')) })
    }
  })

/**
 * CNT-16 (C25): one set of a structural grid's lines: the `spacing` from each line to the next, in
 * metres, and their `names`, one per line, in order. A set with no spacing is one line. At most
 * `gridLinesMost` lines.
 */
export const GridLinesSchema = z
  .object({
    spacing: z.array(finite().positive()),
    names: z.array(text('name').pipe(z.string().refine((value) => value.trim().length > 0, { message: english(said('read.grid.blankName')) }))).optional(),
  })
  .superRefine((set, ctx) => {
    if (set.spacing.length + 1 > limit('gridLinesMost')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['spacing'], message: english(said('read.grid.tooMany', { most: limit('gridLinesMost') })) })
    }
    if (set.names !== undefined && set.names.length !== set.spacing.length + 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['names'], message: english(said('read.grid.namesCount', { lines: set.spacing.length + 1, names: set.names.length })) })
    }
  })

/**
 * CNT-16 (C25): a named structural grid. Its lines are set out from `origin`, turned by `turn`
 * (degrees, counter-clockwise): the `x` lines run along the grid's y, the first through `origin`,
 * and the `y` lines along its x. Unnamed, x lines are numbered 1, 2, 3 and y lines lettered A, B,
 * C. Drawn on the `floors` it names (unstated, every floor); in no measure or check. No two of its
 * lines share a name.
 */
export const StructuralGridSchema = z
  .object({
    id: text('id').pipe(z.string().min(1)),
    name: text('name').optional(),
    origin: Vec2,
    turn: finite().optional(),
    floors: parts(text('id').pipe(z.string().min(1)), 'floors').optional(),
    x: GridLinesSchema,
    y: GridLinesSchema,
  })
  .superRefine((grid, ctx) => {
    const names = [...(grid.x.names ?? []), ...(grid.y.names ?? [])].map((value) => value.trim())
    const twice = names.find((value, i) => names.indexOf(value) !== i)
    if (twice !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: english(said('read.grid.sameName')) })
  })

/**
 * CNT-19 (C29): a parking bay, a thing of its own: never a room or a wall. `at` is its middle,
 * `width` its size across and `length` its size along, in metres; unturned, its length runs along
 * the plan's y, and `turn` turns it about its middle in degrees, counter-clockwise. `number` is its
 * number as marked, as text. It stands on `floor` (C5: unstated, the ground floor).
 */
export const BaySchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  number: text('id').pipe(z.string().refine((value) => value.trim().length > 0, { message: english(said('read.bay.blankNumber')) })).optional(),
  at: Vec2,
  width: finite().positive(),
  length: finite().positive(),
  turn: finite().optional(),
  floor: text('id').pipe(z.string().min(1)).optional(),
})

/** CNT-19: the most points a ramp's middle line may have, as a stair's walking line. */
export const RAMP_RUN_MAX = STAIR_RUN_MAX

/**
 * CNT-19 (C29): a ramp for vehicles between two floors, stated once across them as a stair is.
 * `from` and `to` are the floors it joins, either the higher; `run` is its middle line from its
 * edge on `from` to its edge on `to` (a straight one may say `start` and `end`); `width` is its
 * width across that line. `slope` is the slope the design states, in percent; Grid works the
 * slope out from the floors' levels and the run, and says when the two differ.
 */
export const RampSchema = z.preprocess(withRunFromEnds, z.object({
  id: text('id').pipe(z.string().min(1)),
  name: text('name').optional(),
  from: text('id').pipe(z.string().min(1)),
  to: text('id').pipe(z.string().min(1)),
  width: finite().positive(),
  run: z
    .array(Vec2)
    .min(2)
    .superRefine((list, ctx) => {
      if (list.length <= RAMP_RUN_MAX) return
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: english(said('read.ramp.tooManyPoints', { count: list.length, most: RAMP_RUN_MAX })),
      })
    }),
  slope: finite().positive().optional(),
}))

/**
 * LVL-1: a solid wall that states no height takes its floor's stated `height`. Done on the file
 * as read, before the wall's own default (2.7 m) fills the gap. WRT-6 (lab AU3-6): either way the
 * wall records its height as not stated (`unstated`), so the reading is the derived layer and a
 * stated 2.7 can still be told from one that said nothing. A floor that states no height, or a
 * plan with no floor list, leaves every wall as it was.
 *
 * LVL-6: on a floor that states its `roof`, such a wall rises to the roof instead: it takes the
 * roof's top (its ridge, or a flat roof's eaves), and the roof cuts it to its slope. A gable drawn
 * with no height is then the gable's shape. Its height is recorded as not stated all the same.
 */
function withFloorHeights(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const plan = raw as Record<string, unknown>
  if (!Array.isArray(plan.floors) || !Array.isArray(plan.walls)) return raw
  const heights = new Map<string, number>()
  const roofs = new Map<string, Roof>()
  const seen = new Set<string>()
  for (const floor of plan.floors as unknown[]) {
    if (typeof floor !== 'object' || floor === null) continue
    const { id, height, roof } = floor as Record<string, unknown>
    // The first entry wins, as in `planFloors`; a height the schema refuses is left to refuse.
    if (typeof id !== 'string' || seen.has(id)) continue
    seen.add(id)
    if (typeof height === 'number' && Number.isFinite(height) && height > 0) heights.set(id, height)
    if (roof !== undefined) {
      const read = RoofSchema.safeParse(roof)
      if (read.success) roofs.set(id, read.data)
    }
  }
  if (heights.size === 0 && roofs.size === 0) return raw
  const floorOfRaw = (w: Record<string, unknown>): string => (typeof w.floor === 'string' ? w.floor : DEFAULT_FLOOR_ID)
  // LVL-5: a wall through floors stands as a wall of the floor it rises through.
  const heightFloorOfRaw = (w: Record<string, unknown>): string => (typeof w.through === 'string' && seen.has(w.through) ? w.through : floorOfRaw(w))
  const tops = new Map<string, number>()
  for (const [id, roof] of roofs) {
    const lines = (plan.walls as unknown[]).flatMap((wall) => {
      if (typeof wall !== 'object' || wall === null || Array.isArray(wall)) return []
      const w = wall as Record<string, unknown>
      if (w.virtual === true || floorOfRaw(w) !== id || !isPair(w.start) || !isPair(w.end)) return []
      // HND-11: a wall placed by its face frames the roof on its centre line, as it is read.
      const [start, end] = isFace(w.face) ? centreFromFace(w.start, w.end, w.face, movingThickness(w), arcOf(w)) : [w.start, w.end]
      return [{ start, end, outside: w.kind === 'exterior' }]
    })
    const outside = lines.filter((l) => l.outside)
    const frame = roofFrame(outside.length > 0 ? outside : lines)
    if (frame !== null) tops.set(id, roofTop(roof, frame))
  }
  const walls = (plan.walls as unknown[]).map((wall) => {
    if (typeof wall !== 'object' || wall === null || Array.isArray(wall)) return wall
    const w = wall as Record<string, unknown>
    if (w.height !== undefined || w.virtual === true) return wall
    const floor = heightFloorOfRaw(w)
    const height = tops.get(floor) ?? heights.get(floor)
    return height === undefined ? wall : { ...w, height, [HEIGHT_FROM_FLOOR]: true }
  })
  return { ...plan, walls }
}

const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number' && Number.isFinite(v))

/** The plan's fields, as an object. Read a plan with `FloorPlanSchema`, which also applies `withFloorHeights`. */
export const FloorPlanFieldsSchema = z.object({
  version: z.literal('1').default('1'),
  units: z.literal('m').default('m'),
  // CNT-5: what kind of building the plan is (`BUILDING_TYPES`). A floor may say otherwise for
  // itself (`Floor.building`). Optional and never defaulted: unstated, the plan does not say,
  // and the figure checks run as they did before CNT-5 (version 1).
  building: z.preprocess(readBuilding, BuildingTypeSchema).optional(),
  // QAR-5: the project's own id, which the IFC builds every element's identity from (with the
  // element's kind, floor and id), so a re-export of the project is recognised as the same
  // model whatever the file is called. `grid init` writes it. Keep it, and the parts' ids,
  // stable: a new id reads as a new element. Optional and never defaulted (version 1).
  projectId: text('id').pipe(z.string().min(1)).optional(),
  // SHT-14: the plan's name, as the `plan "<name>"` line of rooms text gives it. The sheet's
  // cover and the IFC project carry it. Optional and never defaulted (version 1).
  name: text('name').pipe(z.string().min(1)).optional(),
  walls: parts(WallSchema, 'walls').default([]),
  rooms: parts(RoomSchema, 'rooms').default([]),
  openings: parts(OpeningSchema, 'openings').default([]),
  // LVL-8 (C12): opening patterns, each expanded into plain openings before anything reads the
  // plan (`expandPatterns`). Optional and never defaulted (version 1).
  patterns: parts(OpeningPatternSchema, 'opening patterns').optional(),
  // C5: names and orders the floors. Advisory — a floor named only by a wall or
  // room still counts as a floor of the plan, so geometry can never become
  // unreachable because a registry entry was forgotten. See geometry/floors.ts.
  floors: parts(FloorSchema, 'floors').optional(),
  // LVL-3: stairs, each stated once across the floors it joins. Optional and never defaulted.
  stairs: parts(StairSchema, 'stairs').optional(),
  referenceImage: ReferenceImageSchema.optional(),
  // CNT-10 (C16): the plan this one is fitted out in, by its path from the project folder. Its
  // walls and openings are read in as existing and never written back. Optional and never
  // defaulted (version 1).
  base: text('path').pipe(z.string().min(1)).optional(),
  // CNT-12: the fixtures (C6). Optional and never defaulted, so a plan written before it reads
  // with no key added (version 1).
  items: parts(ItemSchema, 'items').optional(),
  // CNT-20 (C30): the library entries the plan holds itself, copied in from an office's library
  // folder when an item was placed from it, so the plan reads the same without the folder.
  // Optional and never defaulted (version 1).
  library: parts(LibraryItemSchema, 'library items').optional(),
  // SHT-7: writing on the drawing: the title over it, then notes, tags, symbols and a key, and a
  // sketch layer that is drawn only. Optional and never defaulted (version 1).
  title: text('name').optional(),
  annotations: parts(AnnotationSchema, 'annotations').optional(),
  sketch: parts(SketchItemSchema, 'sketch items').optional(),
  // CNT-3 (C7): the plan's real north (degrees counter-clockwise from +Y), which way its y runs,
  // its front and where it sits; LVL-4 adds the site's ground level (`site.ground`). Optional
  // and never defaulted (version 1).
  north: finite().optional(),
  yAxis: z.enum(Y_AXES).optional(),
  front: FrontSchema.optional(),
  site: SiteSchema.optional(),
  // WRT-6 (C8): where values came from, given, measured, scanned or assumed, and how sure each is
  // (`MarkSchema`). Optional and never defaulted (version 1).
  marks: parts(MarkSchema, 'marks').optional(),
  // VEW-3 (C11): named views, each a camera saved with the plan (`ViewSchema`). Optional and never
  // defaulted (version 1).
  views: parts(ViewSchema, 'views').optional(),
  // CNT-17 (C14): the rooms and routes that need to be accessible (`AccessibleSchema`). Optional
  // and never defaulted (version 1).
  accessible: AccessibleSchema.optional(),
  // HND-11 (C15): lengths taped on site, kept as checks beside the drawing (`TapedSchema`).
  // Optional and never defaulted (version 1).
  taped: parts(TapedSchema, 'taped lengths').optional(),
  // CNT-4 (C18): the flat types, each stated once (`FlatTypeSchema`), and the flats, each a group
  // of rooms by id (`FlatSchema`). Optional and never defaulted (version 1).
  flatTypes: parts(FlatTypeSchema, 'flat types').optional(),
  flats: parts(FlatSchema, 'flats').optional(),
  // CNT-6 (C23): the plan's buildings, each a named group of its own floors (`PlanBuildingSchema`),
  // and shapes drawn round it for context, in no measure (`ContextShapeSchema`). Optional and
  // never defaulted (version 1).
  buildings: parts(PlanBuildingSchema, 'buildings').optional(),
  context: parts(ContextShapeSchema, 'context shapes').optional(),
  // CNT-15 (C24): the named wall, door and window types the parts name, and the defaults
  // (`PartTypesSchema`). Optional and never defaulted (version 1).
  types: PartTypesSchema.optional(),
  // CNT-16 (C25): the columns, each a thing of its own (`ColumnSchema`), and the structural grids,
  // each its named lines (`StructuralGridSchema`). Optional and never defaulted (version 1).
  columns: parts(ColumnSchema, 'columns').optional(),
  grids: parts(StructuralGridSchema, 'structural grids').optional(),
  // CNT-19 (C29): the parking bays (`BaySchema`) and the ramps between floors (`RampSchema`).
  // Optional and never defaulted (version 1).
  bays: parts(BaySchema, 'parking bays').optional(),
  ramps: parts(RampSchema, 'ramps').optional(),
  // WRT-2: the plan was last written from rooms text (`grid write`). `revision` is its
  // fingerprint as Grid wrote it, `boundaries` each room's boundary fingerprint: a boundary is
  // derived from where the rooms are, and one edited by hand is refused (`room/derived-edited`).
  // Optional and never defaulted (version 1). One that cannot be read is read as unstated.
  // WRT-7: how the person reads lengths and areas: the unit, the area unit, the decimal mark and
  // the precision (`types/units.ts`). It never changes a stored number: the file is in metres.
  // Optional and never defaulted (version 1). One that cannot be read is read as unstated.
  // MSG-11: `language` is the language Grid writes its words in for this plan (`en`, `es`); a
  // language with a decimal comma writes one unless `decimal` says otherwise. With a language,
  // `length` may be left out: then lengths are in metres. MSG-22: a language with a region
  // (`es-MX`, `es-ES`) is read as its language. MSG-24 (C32): any language, and `words`, the plan's
  // own words for Grid's keys in a language (`messages/words.ts`), each word checked by the reader.
  display: z
    .object({
      length: z.enum(['m', 'cm', 'mm', 'ft-in']).optional(),
      language: z.preprocess((value) => readLanguage(value) ?? value, z.string().regex(LANGUAGE_TAG)).optional(),
      words: z.record(z.string(), z.record(z.string(), z.string())).optional().catch(undefined),
      area: z.enum(['m2', 'ft2']).optional(),
      decimal: z.enum(['point', 'comma']).optional(),
      precision: z.number().int().min(0).max(5).optional(),
    })
    .optional()
    .catch(undefined),
  written: z
    .object({
      from: z.literal('rooms'),
      revision: z.string().regex(/^[0-9a-f]{16}$/),
      boundaries: z.record(text('id'), z.string().regex(/^[0-9a-f]{8}$/)),
    })
    .optional()
    .catch(undefined),
})

// CNT-15: the types fill first, so a wall's type height is stated before its floor's is taken.
/**
 * CNT-20 (C30): each item that names a library entry (`library`) filled from it, done on the file
 * as read, so every reader sees a placed bed's size wherever it came from. The plan's own
 * `library` is looked in first, then Grid's built-in one (`BUILT_IN_ITEMS`). A value the item
 * states is kept; what the entry filled is marked (`FROM_LIBRARY`) and the item's schema records
 * it in `fromLibrary`, which is never written back (`statedItem`). A name no entry has fills
 * nothing, and the drawing's check says so (`item/unknown-library`).
 */
export function withLibrary(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw['items'])) return raw
  const items = raw['items']
  if (!items.some((item) => isRecord(item) && typeof item['library'] === 'string')) return raw
  const own = new Map<string, LibraryItem>()
  if (Array.isArray(raw['library'])) {
    for (const entry of raw['library']) {
      const read = LibraryItemSchema.safeParse(entry)
      if (read.success && !own.has(read.data.name)) own.set(read.data.name, read.data)
    }
  }
  return {
    ...raw,
    items: items.map((item) => {
      if (!isRecord(item) || typeof item['library'] !== 'string' || (item as Record<symbol, unknown>)[FROM_LIBRARY] !== undefined) return item
      const entry = own.get(item['library']) ?? builtInItem(item['library'])
      if (entry === undefined) return item
      const filled: LibraryValue[] = []
      const next: Record<string | symbol, unknown> = { ...item }
      for (const key of LIBRARY_VALUES) {
        if (entry[key] === undefined || item[key] !== undefined) continue
        next[key] = key === 'size' ? [...entry.size] : entry[key]
        filled.push(key)
      }
      next[FROM_LIBRARY] = filled
      return next
    }),
  }
}

/**
 * CNT-20 (C30): an item as its file states it: without the values its library entry filled in
 * (`fromLibrary`), for whatever writes an item back. One that took nothing is returned as it is.
 */
export function statedItem<T extends { readonly fromLibrary?: readonly LibraryValue[] | undefined }>(item: T): Omit<T, 'fromLibrary'> {
  if (item.fromLibrary === undefined) return item
  const { fromLibrary, ...rest } = item
  const out: Record<string, unknown> = { ...rest }
  for (const key of fromLibrary) delete out[key]
  return out as Omit<T, 'fromLibrary'>
}

// CNT-20: then the items from their library entries, which no type touches.
export const FloorPlanSchema = z.preprocess((raw) => withFloorHeights(withLibrary(withTypes(raw))), FloorPlanFieldsSchema)

export type Vec2 = z.infer<typeof Vec2>
export type Floor = z.infer<typeof FloorSchema>
export type WallKind = z.infer<typeof WallKindSchema>
export type Phase = z.infer<typeof PhaseSchema>
export type Wall = z.infer<typeof WallSchema>
export type WallArc = z.infer<typeof WallArcSchema>
export type RoomUse = z.infer<typeof RoomUseSchema>
export type RoomTenure = z.infer<typeof RoomTenureSchema>
export type OutdoorKind = z.infer<typeof OutdoorKindSchema>
export type Room = z.infer<typeof RoomSchema>
export type OpeningType = z.infer<typeof OpeningTypeSchema>
export type Opening = z.infer<typeof OpeningSchema>
export type OpeningPattern = z.infer<typeof OpeningPatternSchema>
export type PatternOpening = z.infer<typeof PatternOpeningSchema>
export type Stair = z.infer<typeof StairSchema>
export type Ceiling = z.infer<typeof CeilingSchema>
export type Roof = z.infer<typeof RoofSchema>
export type Rooflight = z.infer<typeof RooflightSchema>
export type Dormer = z.infer<typeof DormerSchema>
export type RoofShape = (typeof ROOF_SHAPES)[number]
export type LoweredZone = z.infer<typeof LoweredZoneSchema>
export type OpeningAnchor = z.infer<typeof OpeningAnchorSchema>
export type OpeningPart = z.infer<typeof OpeningPartSchema>
export type ReferenceImage = z.infer<typeof ReferenceImageSchema>
export type Item = z.infer<typeof ItemSchema>
export type LibraryItem = z.infer<typeof LibraryItemSchema>
export type Annotation = z.infer<typeof AnnotationSchema>
export type SketchItem = z.infer<typeof SketchItemSchema>
export type Front = z.infer<typeof FrontSchema>
export type Site = z.infer<typeof SiteSchema>
export type SiteThing = z.infer<typeof SiteThingSchema>
export type Setback = z.infer<typeof SetbackSchema>
export type Mark = z.infer<typeof MarkSchema>
export type View = z.infer<typeof ViewSchema>
export type Accessible = z.infer<typeof AccessibleSchema>
export type AccessibleRoute = z.infer<typeof AccessibleRouteSchema>
export type Taped = z.infer<typeof TapedSchema>
export type FlatType = z.infer<typeof FlatTypeSchema>
export type Flat = z.infer<typeof FlatSchema>
export type PlanBuilding = z.infer<typeof PlanBuildingSchema>
export type ContextShape = z.infer<typeof ContextShapeSchema>
export type Column = z.infer<typeof ColumnSchema>
export type StructuralGrid = z.infer<typeof StructuralGridSchema>
export type GridLines = z.infer<typeof GridLinesSchema>
export type Bay = z.infer<typeof BaySchema>
export type Ramp = z.infer<typeof RampSchema>
export type BeyondWall = (typeof BEYOND_WALL)[number]
export type WallType = z.infer<typeof WallTypeSchema>
export type DoorType = z.infer<typeof DoorTypeSchema>
export type WindowType = z.infer<typeof WindowTypeSchema>
export type PartTypes = z.infer<typeof PartTypesSchema>
export type Finishes = z.infer<typeof FinishesSchema>
export type FinishFace = z.infer<typeof FinishFaceSchema>
export type FinishBand = z.infer<typeof FinishBandSchema>
export type FloorPlan = z.infer<typeof FloorPlanSchema>

export const EMPTY_FLOOR_PLAN: FloorPlan = {
  version: '1',
  units: 'm',
  walls: [],
  rooms: [],
  openings: [],
}

export function parseFloorPlan(raw: unknown): FloorPlan {
  return FloorPlanSchema.parse(raw)
}

export function safeParseFloorPlan(raw: unknown): FloorPlan | null {
  const result = FloorPlanSchema.safeParse(raw)
  return result.success ? result.data : null
}
