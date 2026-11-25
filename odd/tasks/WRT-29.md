# WRT-29: an opening that moved is said to have moved, in the edit's verdict and in grid_compare

## Outcome

A door or window that stands somewhere else in the second plan is said to have moved, and how
far, wherever Grid compares two plans by what stands where (`comparePlans`): the verdict of every
change (`grid_change_*`, `grid edit`), `grid write` and `grid_write_rooms` against the plan they
replace, and `grid_compare`.

- A door moved 2.88 m along its wall under the same id is no longer "the same building ...
  every wall, opening and room is where it was". The edit answers `The plan before → the plan
  now: net ... (+0.00); door "d1" moved 2.88 m along its wall.`, and `grid_compare` says the
  same in its verdict and lists `door "d1": moved 2.88 m along its wall` under "Openings
  changed".
- A window that moved with its wall (the wall moved across, the window kept its place along it)
  is said to have moved with its wall, how far, instead of not being named at all.
- Many openings that moved are counted, with how far: `14 windows moved 0.60 m with their walls`,
  or `14 openings moved (0.30 to 0.60 m)` when the distances or kinds differ.
- Each entry of `openingsChanged` carries `moved`: how far its middle moved on the drawing, in
  metres, or null when it stands where it stood.

## Design

- `packages/cli/src/quantities/compare.ts`:
  - The likeness (same, moved, mirrored, turned) is found with openings paired by place only.
    Today an opening that is not at its place is paired by its id as a fallback, and so counts
    as "where it was": the root of the bug. With no fallback, a moved opening leaves one opening
    of each plan unpaired, so the plans are not the same building, and the comparison goes on to
    list what differs.
  - What differs is paired the way `grid_diff` pairs openings: the core's `alignPlans`
    (`packages/floorplan/src/geometry/diff/place.ts`): by place, then at the same place along a
    wall that moved (WRT-12), then by id of the same type, then by id; ids first for two plans
    both written rooms first, as `compareBuildings` does. Decision: `alignPlans` is used as it
    is, with no turn (a mirrored or turned plan is found by the likeness above and lists no
    openings); the distance is measured under the comparison's own transform, so it reads with
    the walls' moves (`wallsChanged`).
  - A paired opening whose middle moved more than `diffPlace` (MSG-15's tolerance for "the same
    place", the one the diff uses) has moved. Said "along its wall" when its wall stands where
    it stood, "with its wall" when its wall moved and it kept its place along it (measured from
    either end, `diffPlace`), and plain "moved" otherwise. A door paired by id that changed type
    says "was a window", as the diff does.
  - `OpeningChange` gains `moved` (metres or null). The verdict names moved openings in their own
    part (one by id with its distance, several counted with their distance or range), and keeps
    "N openings changed" for the other changes, so a door both moved and widened is said moved
    and changed.
- The new words are keys in `packages/floorplan/src/messages/en.ts` and `es.ts`
  (`compare.opening.*`), said with `said`, so `compare.ts` gains no English sentence
  (`ownWords.test.ts`). Decision: the Spanish is a draft, as the file's header says.
- `packages/cli/src/mcp/readTools.ts` needs no change: its "Openings changed" line already lists
  each change's words.
- No new message code, no convention, no schema change.

## Done

- `packages/cli/src/quantities/__tests__/compareOpenings.test.ts` (new), failing before:
  - a door moved 2.88 m along its wall under its id: not the same building; the verdict says
    `door "..." moved 2.88 m along its wall`; `openingsChanged` holds it with `moved` 2.88;
    in place (the edit's verdict) and between two plans (`grid_compare`, write).
  - a wall moved 0.60 m across with its window: the window is said to have moved 0.60 m with its
    wall.
  - many windows moved: counted with their distance.
  - the same plan twice is still the same building, every opening where it was; a plan moved on
    the drawing is still "moved", not every opening moved.
- `npx vitest run packages/cli/src/quantities packages/cli/src/edit packages/cli/src/mcp
  packages/cli/src/command`, then the whole `packages/cli` and `packages/floorplan` folders,
  `ownWords.test.ts`, `contract.test.ts`, `npm run typecheck`, `npm run lint`,
  `npm run scoreboard`.
