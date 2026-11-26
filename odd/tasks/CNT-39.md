# CNT-39: a door or window that states all its sizes stays out of the default type

## Outcome

A door or window that names no type and states every size its default type would fill (width and
height, and the sill when the type has one) is not given the default type. Its schedule line
lists it with no type, so a 0.6 x 0.6 loft window is no longer counted as a 900 x 1200 default
window. A part that names its type is unchanged: it is of that type and may differ from it. A part
that leaves a size out still takes the default and fills only that size.

## Design

- `withTypes` in `packages/floorplan/src/types/floorplan.ts`: in `fillOpening`, an opening with no
  named type returns as it is when it already states each size the default type would fill. No
  `typed` mark, no type id.
- Decision: "states all its sizes" means width, height and, for a type with a sill, the sill.
  A window stating width and height only still takes the default and its sill.
- Doors follow the same rule, since the default is the same mechanism.
- Docs: the `defaults` bullet of `docs/plan-file.md` says so.

## Done

- Tests in `packages/floorplan/src/geometry/__tests__/partTypes.test.ts`: a window stating width,
  height and sill takes no default type; one stating only width and height takes the default and
  its sill; a window naming the type keeps it with different sizes; a door likewise.
- The type check, lint, the part types tests, `ownWords` and `tolerances` tests pass.
