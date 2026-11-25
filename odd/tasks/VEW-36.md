# VEW-36: a facade draws the straight walls between curved corners, and nothing behind them

## Outcome

- A building whose corners are curved walls (a rounded square, a tower with radiused corners)
  shows on each side's facade the straight wall facing that side, with its doors and windows,
  between the two curved corners beside it, at every corner radius and whatever order the plan
  lists its walls in.
- A curved corner on the far side of the building is never drawn on a side it does not face.
- A wall inside the building (round a courtyard, a core or a light well) and its doors are not
  drawn or listed on a facade where the outside wall in front of it hides it whole, as before; the
  outside wall is now found, so it hides them.

## Design

- `packages/floorplan/src/geometry/facade.ts`, the one file of the change.
  - `straightened`: it takes out the points of the outline that only bend it by a hair. It used to
    test each point against the line through its neighbours at that moment, so a straight side
    running into a curve swallowed the curve's first stations one by one and ended a few
    centimetres off the straight wall's face, beyond `facadeOnFace`: the wall was no longer found
    on its own edge, and the facade showed the corners alone, or whatever stood behind. A point is
    now taken out only when it and every point taken out before it between the same two
    neighbours lie within `facadeOnFace` of the line between them, so a side never drifts off the
    points it stands for. No new tolerance.
  - `curveBow` (new): how far a curved wall's face may bow off a straightened edge and still lie
    on it. It was the sagitta over the whole edge, metres on a long straight side between tight
    corners, so a corner 30 m away was taken for a piece of that side. It is now that sagitta,
    and never more than `facadeOnFace`, which the new straightening guarantees is enough. Read by
    `coversOf` and by `openingsIn` for a curved wall's openings.
- Decided: no rule of its own for the walls round a hole in the outline. They are hidden by the
  faces in front of them (`seenWalls`, VEW-25) like any other face, which keeps a taller core
  seen above a lower outside wall; the fault was that the outside wall was missing.
- Decided: no change to `facadeOnFace` or to how a curved wall is traced.

## Done

- New tests in `packages/floorplan/src/geometry/__tests__/facade.test.ts`, each failing before
  the change:
  - a rounded-square tower, its core round a courtyard: each side lists its straight wall and
    the two corners beside it, the south side its 22 m window, the straight wall spans the side
    between the corners, and no core wall or lift door is on any facade;
  - the same tower with tight corners and the curved walls listed first: no side lists a corner
    it does not face.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, the words and
  tolerance tests and `npm run scoreboard`, no count worse.
