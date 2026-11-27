# CNT-59: a part keeps the GlobalId, name and tag another tool gave it

## Outcome

A plan written from a consultant's IFC model keeps each wall's, door's, window's, opening's,
space's and storey's own GlobalId, name and tag, and writes them back into the IFC and the DXF it
exports in place of Grid's own, so the consultant's tools recognise every element they sent as the
same element. Grid's ids stay what every tool and edit takes: the outside identity sits beside the
id and never replaces it.

- A wall, an opening, a room and a floor MAY state `identity`: `{ guid, name, tag }`, each
  optional. `guid` is an IFC GlobalId (22 characters of IFC's alphabet) or a UUID; any other text
  is refused by the schema with the forms it takes.
- `grid write --from model.ifc` (and `grid_write_rooms` with `from`) sets it on the parts it
  writes: each wall, door, window and opening its GlobalId, its Name and its Tag; each room its
  space's GlobalId and Name; each floor its storey's GlobalId and Name. A wall Grid splits at its
  junctions keeps the source's identity on its longest piece only, so no two parts share a
  GlobalId. Writing the rooms text again keeps every identity by id, as facts are kept.
- The IFC writes a part's `guid` as its GlobalId (a UUID in IFC's 22-character form), its `name`
  as its Name and its `tag` as its Tag (a door's or window's in place of its schedule mark). A
  space and a storey have no Tag in IFC2X3, so their tag is written in their facts set. Every
  other GlobalId Grid issues steers clear of the kept ones, and a GlobalId two parts state (a
  copied building) is kept by the first only.
- The DXF writes a door's or window's `tag` as its block's MARK, a room's as its tag's NUMBER,
  and every part's identity on the facts layer (`GUID`, `name`, `tag`), as its facts are.
- An edit that cuts a wall in pieces (a room added against it, two rooms merged across it) keeps
  the wall's id and identity on its longest piece; the other pieces are new walls with no
  identity. Before, every piece took a new id and a copy of the wall's fields.
- `grid_set` sets a wall's, room's or floor's `identity` as any other field.

## Design

- `packages/floorplan/src/types/identity.ts` (new, pure): what an identity is, the GlobalId and
  UUID forms, `ifcGlobalId` (a stated guid in IFC's form) and `identityOf`.
- `packages/floorplan/src/types/floorplan.ts`: `IdentitySchema` (strict, so a misspelt field is
  named) and `identity` on `WallSchema`, `OpeningFieldsSchema`, `RoomSchema` and `FloorSchema`.
  C9 is widened in its header (facts of the person's own, and now what another tool calls the
  part); no new convention number. `FACT_FIELDS` (`types/facts.ts`) lists the four fields and the
  sheet's coverage places them (one small edit outside the area, `cli/src/sheet/coverage.ts`).
- `packages/floorplan/src/geometry/export/ifc.ts`: the GlobalId issuer reserves the plan's kept
  GlobalIds before it issues any, and hands each out to the first element that asks for it;
  walls, doors, windows, plain openings, spaces and storeys take name and tag from the identity.
  `export/planExport.ts` gives a door's tag as its DXF mark; `geometry/export/dxf.ts` writes the
  identity lines with the facts and a room's tag as its number.
- `packages/floorplan/src/rooms/facts.ts` carries `identity` by id when rooms text is written
  again; `rooms/read.ts` counts it as carried, not a difference; `rooms/ids.ts` and the CLI's
  `edit/buildingParts.ts` never read its words as ids. `compile.ts` is not touched.
- Import: `cli/src/drawing/ifc.ts` reads each element's Name and Tag beside its GlobalId (model:
  `kept` on the drawn parts); `drawing/toRooms.ts` works out the identities by id (a source on
  several walls: its longest), and `command/write.ts` sets them as it sets the sources' facts.
  The source facts (`guid`, `handle`) stay as they were. A DXF's handles are not GlobalIds, so a
  DXF import sets none.
- Edits: `edit/merge.ts` gains `pieceIds`, which gives the longest piece the wall's own id, and
  `cutWall` then changes that wall's ends and adds the other pieces without its identity;
  `edit/addRoom.ts` and the merge use it. `edit/phases.ts` reads a wall shortened on its line
  with pieces added along it as cut where it stood, so in a plan with phases the pieces stay
  existing, as they did when every piece took a new id.
- Decisions: `identity` is one object, not three loose fields, because a room and a floor already
  have a `name` of their own (the person's), which an outside tool's name must not overwrite. The
  other pieces of a cut wall keep its facts (as before) but no identity: they are new elements to
  the outside tool. No new tolerance: the import's matching reuses the lengths it already had.

## Done

- `export/__tests__/identity.test.ts` (with the exports): the schema takes a GlobalId and a UUID and refuses other
  text and a misspelt field; a UUID gives its IFC form.
- The same file: a wall, door, room and floor with an identity
  are written with its GlobalId, Name and Tag; no other GlobalId equals a kept one; a GlobalId two
  parts state is written once.
- The same file: the DXF MARK and room NUMBER are the tags
  and the facts layer carries the GUID.
- `rooms/__tests__/identity.test.ts`: identities are carried by id when the text is written again.
- `cli/src/edit/__tests__/identity.test.ts`: adding a room against a wall with an identity leaves the wall's id
  and GUID on the longest piece and no other piece with it; a merge the same.
- `cli/src/drawing/__tests__/fromDrawing.test.ts`: a plan written from an IFC keeps the
  GlobalIds, and its IFC export writes them back.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  tolerances test, `ownWords.test.ts` and `contract.test.ts`.
