# CMD-43: read a DXF or IFC drawing into rooms text

## Outcome
An agent handed a surveyed drawing no longer retypes its coordinates. `grid write --from
survey.dxf` and `grid_write_rooms from=survey.dxf` (or an `.ifc`) read the drawing and answer with
rooms text: the rooms as polygons of their inside faces with their names, the doors and windows
by the rooms they join, and the floors with their elevations. The text is written beside the plan
(`<plan>.rooms`), so the agent can read it, change a line and write it again with `grid write`,
and the plan is written from it through the one rooms compiler, so every check that holds for
rooms text holds here. The answer says how each DXF layer (or IFC class) was read and why, what
was assumed (units, heights, uses, curved faces as straight pieces, gaps read as openings), what
was left out, and how far the plan written is from the drawing: each room's area beside the
drawn one and each opening's distance from where the drawing has it. Every room, opening and wall
keeps the DXF handle or IFC GlobalId it came from as a fact (`handle`, `guid`), so a later reading
can be matched to the parts and a person can find the entity in their CAD program.

## Design
- New folder `packages/cli/src/drawing/`, all pure but the last file:
  - `model.ts`: a drawing as Grid reads it, the same for both formats: floors, room outlines,
    wall faces (segments with their source), wall footprints, openings (kind, centre, direction,
    width, height, sill, source), texts, the layer map, assumptions and what was left out.
  - `dxf.ts`: an ASCII DXF reader (group code and value pairs): `$INSUNITS`, the layer table,
    blocks, and the entities LINE, LWPOLYLINE and POLYLINE with bulges, ARC, CIRCLE, TEXT, MTEXT
    and INSERT with its ATTRIBs. Blocks that are not doors or windows are exploded into their
    insert's frame (layer 0 takes the insert's layer). Each layer is read as walls, doors,
    windows, room outlines, room names or nothing, by its name (English, German, Spanish, French
    words and the AIA `A-WALL` style), and `layers` (`walls=A-MUR,A-MUR2;doors=PORTES`) overrides
    it. A curved face (a bulge, an arc) is cut into straight pieces no more than 1 cm off the curve,
    and said. A binary DXF is refused with what to save instead.
  - `step.ts`: an ISO 10303-21 reader: `#n=TYPE(...)` records with strings (with `\X2\` codes),
    numbers, enums, references, lists, `$` and `*`.
  - `ifc.ts`: the IFC read from it: the length unit (`IFCSIUNIT` with its prefix, a conversion
    for feet and inches), local placements composed to the world, storeys with their elevations,
    spaces (their footprint from an extruded profile: arbitrary polyline, indexed poly curve or
    rectangle; LongName as the name, Name as the number), walls (footprints from their bodies),
    doors and windows (OverallWidth, OverallHeight, placement; the sill from its height above the
    storey) and which storey holds each (`IfcRelContainedInSpatialStructure`, `IfcRelAggregates`).
  - `faces.ts`: rooms worked out from wall faces where a drawing has no room outlines: the faces
    are noded where they meet, the gaps of doors and windows closed by joining two ends on one
    line up to 3 m apart, and the regions of the plane they bound found by walking each
    half-edge's left side. A region that a name stands in, or that is wider than the widest wall
    (`roomsWallWidest`, by twice its area over its perimeter), is a room; the thin rest is wall.
    Each closed gap pair between two rooms, or a room and the outside, is an opening, a door or
    window when an insert of that kind stands in it, else a doorless opening, said as assumed.
    The outside walls' thickness is the commonest distance from a room's face to the building's
    outline, said.
  - `toRooms.ts`: rooms text from a drawing, checked by compiling it. First the rooms alone
    (polygons counter-clockwise, ids from their names, use from the name when it plainly means
    one, else `-`, the handle or GUID as a room fact); then each opening is written on the wall
    the compile put under it, `between a and b` or `in <room> <side>`, `<m> from <side>` measured
    as the compiler measures (along the room's own side), and the whole text compiled again: an
    opening the compile places more than 5 mm from where the drawing has it, or refuses, is
    written as a `raw opening` on that wall's id with the drawn offset, and said. The walls are
    matched to the source by where they stand (an IFC wall's footprint holding the wall's middle;
    the DXF entities along its faces) and their handles or GUIDs returned by wall id.
  - `fromDrawing.ts`: the command's and tool's step: reads the file through the project (size
    limit, text decoded one way), writes `<plan>.rooms` (refusing to write over a rooms file it
    did not write, unless `replace`), then the plan through `writeRoomsIntoProject`, whose new
    `facts` option sets the walls' and openings' source facts by id before the plan is stamped,
    so the plan reads as written from rooms text and a later rewrite keeps them (CNT-9's carry).
    A text the compile refuses is still written to `<plan>.rooms`, and the refusal says so.
- `grid write --from <file> [--layers <map>] [--units <m|cm|mm|in|ft>]` in `command/main.ts`;
  `grid_write_rooms` takes `from`, `layers` and `units`, one way in among rooms, roomsFile,
  layout, scan and from. `units` sets a DXF with no `$INSUNITS`; with none, the size of the
  drawing decides (millimetres past 300 units across) and says so.
- Decision: the answer is rooms text, not a plan written in its own way, so the agent can check
  and change one line and the plan always comes from the one compiler.
- Decision: walls are not written from the drawing; the compiler works them out from the rooms'
  faces as it does for a scan, so a wall's thickness is the gap the drawing leaves. Free-standing
  walls, columns in a room and holes are left out and listed.
- Decision: no new convention in `types/floorplan.ts`; the sources are facts of the person's own
  (C9), named `handle` and `guid`, and no new message code.
- English sentences of the new files are counted in `ownWords.test.ts` as not moved yet, as the
  scan's are.

## Done
- `packages/cli/src/drawing/__tests__/`: invented drawings only. DXF: a flat of three rooms
  drawn as wall lines in millimetres with door and window inserts and names, read to rooms text
  that writes, its areas within a millimetre, doors between the right rooms; LWPOLYLINE bulges
  and an ARC face cut into pieces and said; room outline polylines on a rooms layer used as the
  rooms; `layers` overriding a layer's reading; `$INSUNITS` missing and guessed; a binary DXF
  refused. A plan exported by Grid as DXF reads back to the same rooms and areas. IFC: a small
  hand-written IFC4 file of two storeys with spaces, walls, a door and a window, in millimetres,
  read to two floors with their elevations, the GUIDs on rooms, walls and openings; a plan
  exported by Grid as IFC reads back with the same rooms and areas. The STEP reader's strings,
  `\X2\` codes, nested lists and `$`.
- The command and tool: `grid write --from` writes `<plan>.rooms` and the plan, the facts kept;
  the plan is stamped as written from rooms text and writing `<plan>.rooms` again changes nothing;
  a refused text is still written beside the plan; the tool's `from` with `rooms` refused as two
  ways in; `everyPath.e2e.test.ts` lists `--from` and `from`.
- `ownWords.test.ts`, `tools.test.ts`, `npm run typecheck`, `npm run lint`,
  `npx vitest run packages/cli`, `npm run scoreboard`.
