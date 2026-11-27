# 2026-11-27: a curved or angled side is reported as one side (CMD-49)

## For people

- Measuring a round room, a band or a room with a bowed side now lists each curve as one side, with its radius and its length along the curve, instead of the dozens of short straight pieces the curve is drawn by. A round room is described as round and its width across, a curved band by its length along its middle and its width, and a room turned on the drawing by its own sides and its turn, not by the box round it (CMD-49).

## For agents

- `grid_measure what=room`: a curve is one side, `<facing> a curved side, radius <r>, <length> long` (or `a curved side all the way round, …`), split only where the wall under it changes; each side in the data has `curve` (`centre`, `radius`, `sweep` in degrees, counter-clockwise positive) or `null`, and the answer has `form` (`round`, `band`, `turned`, `four`, `curved` or `null`). The perimeter is measured along the curves. The size of a room not square to the drawing is said by its form: `round, <d> across`, `a curved band <l> long along its middle and <w> wide`, `<a> × <b>, turned <deg>° on the drawing`, `four sides going round, …`.
- `grid_describe`: the person's card says the same forms with the unit on every length; `for=agent` adds `round:<d>`, `band:<long>x<wide>`, `turned:<deg>:<W>x<D>`, `sides:<a>/<b>/<c>/<d>` or `curves:r<radius>/<length>,…` after the size (its key line says so); `length=walk` says a round room and a band by their shape at their stop, and its agent form adds the same token. No new code in the check record.
