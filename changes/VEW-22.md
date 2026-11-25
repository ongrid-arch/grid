# 2026-11-25: drawings of angled plans, wedge rooms and wide doors read right (VEW-22)

## For people

- A plan whose outside walls run two ways, two wings at an angle, has each wing dimensioned
  square to itself, never one wing measured along the other's walls. A facade at an angle (a
  chamfered corner, the sides of a fan) is dimensioned along itself, and a plan no one way of
  walls dominates, such as a fan, is measured along the page, its overall width and depth from
  its outline (VEW-22).
- The chains outside a plan keep no slivers of a few millimetres from walls a little off
  square, and a partition thinner than 0.12 m that meets a facade is marked at its centre line,
  with no figure for its thickness (VEW-22).
- A room label stays inside a long thin wedge room when it fits there anywhere (VEW-22).
- Turning or mirroring a plan keeps every length exactly: a plan drawn finer than a millimetre no
  longer changes its room sizes when turned a quarter round (VEW-22).
- A door 1.5 m wide or more that states no kind is drawn as Grid's guess, a pair when its swing is
  stated and it is no wider than 3 m, else a sliding door, never as one huge leaf. It is still
  checked as one leaf and asked about until its kind is stated (VEW-22).

## For agents

- Floor plan pictures (`grid_view kind=plan`, `grid draw`, the sheet) dimension each wing and
  each angled facade along itself; such a dimension carries `chain`, the line of chains it adds
  up in, with `side` in the wing's own directions. Three new tolerances: `chainSliver` (0.01 m),
  `chainThinWall` (0.12 m) and `wingShare` (0.25). A guessed door's opening carries
  `data-kind-guess="true"` and is drawn from the guessed kind.
- `opening/wide-single-leaf` now says the door "is checked as one swinging leaf this wide and
  drawn as Grid's guess, a pair or a sliding door". No new code in the record.
- `grid_mirror` with `turn` or `how` keeps a plan's coordinates to the micrometre instead of
  rounding them to millimetres.
- `grid_view`'s `look` says that a picture is always on light paper, so `dark` draws the working
  look, as it already did.
