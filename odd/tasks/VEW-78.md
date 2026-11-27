# VEW-78: glass, ceilings and finish tints in the 3D view and its stills

## Outcome

An agent or a person looking at the model in 3D, in an eye view or in the preview sees the rooms
as they are finished and glazed, and the answers say the same:

- Glass is see-through and tinted, in every window, in a door whose type is glazed (its leaves are
  drawn as glass in their frame) and in a wall whose type is glazed (a curtain wall, a glass
  partition). Through it an eye view shows a plain sky over a ground colour, never the page's flat
  background.
- An eye view (a camera standing in a room) draws each room's ceiling at the room's height, with
  its lowered zones and under a sloped roof as the ceiling plan has them, so the top of the picture
  is a ceiling, not background.
- A room's floor is tinted by its floor finish, its ceiling by its ceiling finish, and its wall
  faces by its walls finish, a feature wall's face by its own and each band (a splashback, tiles to
  1.2 m) over its height. A finish Grid has no tint for keeps the model's own colour.
- `grid_view kind=eye` lists a glazed door with the windows, sill and top against the eye, and says
  "The room has no windows" only when it has no window and no glazed door; when its doors are not
  marked glazed it says how to mark them. `grid_measure what=sun` counts a glazed door's hole as
  glazing beside the windows, and says so.

## Design

- Core (`packages/floorplan/src/geometry`), which works out every shape the viewer draws:
  - `partTypes.ts`: `openingGlazed` (a window unless its type says it is not; a door when its type
    says it is glazed or its material is glass) and `wallGlazed` (a wall of a glazed type).
  - `scene3d.ts`: `SceneOpening.glazed` and `SceneWall.glazed`, set by `buildScene` from the plan's
    types; optional, so the GLB writer and other readers are untouched.
  - New `interior.ts`, `sceneInterior(plan, storeyHeight)`: for each room (no zone, void or open
    outdoor space) its ceiling pieces (`roomCeiling`, whether or not the room states a ceiling)
    and its linings: each side of its inside outline that lies on a straight wall's face, as a
    rectangle on that face from the room's floor to its ceiling, open over each opening in it,
    with the finish the room gives that face; and each band, as a strip on the faces it covers.
    Curved walls get no lining (their faces are arcs and their openings are being reworked).
- Viewer (`packages/viewer/src/canvas3d`, `still/`):
  - `finishTint.ts`: a finish name to a tint, by the words in it (oak, tile, concrete, carpet,
    brick, marble, and colour words, which win); null for a name with none of them.
  - `Interior3D.tsx`: draws the linings (always) and the ceilings (when asked), each a flat shape
    a hair off its face into the room, so it shows over the wall.
  - `Storey3D` tints each slab by its floor finish, draws glazed walls as glass and hands
    `glazed` to `Opening3D`, which draws glass in one tint (`GLASS`) and a glazed door's leaves
    as glass. `BuildingScene` takes `ceilings`.
  - `rasterise` takes `sky`: the background drawn as a gradient by each sample's direction, sky
    above the horizon and ground below. `planStill` turns on the ceilings and the sky for a camera
    standing in a room; `StillOptions.ceilings` and `.sky` say otherwise. Views from outside are
    drawn as before.
- CLI: the eye view's window list (`readTools.ts`) and the sun table text read `openingGlazed`.
  The edits outside the 3D view are kept to those lines.
- Decision: a door is glazed only when the plan says so through its type (`glazed`, or a glass
  material). An unmarked sliding door is not guessed to be glass; the eye view's answer says how
  to mark it. No new convention in `types/floorplan.ts`.

## Done

- `interior.test.ts`: a room's linings follow its inside faces with a hole per opening, a feature
  wall takes its face finish, a band covers its height, a ceiling stands at the room's height
  whether or not it states one, and a curved wall has no lining.
- `partTypes`/`sun` tests: a glazed door counts, an unglazed one does not; a window of a type
  stated not glazed is not glass.
- Viewer tests: a still from inside a room shows the ceiling's colour at the top, not the
  background; glass shows the sky behind it; an oak floor is tinted; a glazed wall is see-through;
  the finish tints read their words.
- `grid_view kind=eye` lists a glazed door with the windows.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on each folder changed.
