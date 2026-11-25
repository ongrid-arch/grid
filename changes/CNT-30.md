# 2026-11-25: straight walls join curved walls at the curve's face (CNT-30)

## For people

- Where a straight wall meets a curved wall at a corner, the two walls now end on one line and
  the corner is drawn clean, with no notch between them (CNT-30). A partition that runs into a
  curved wall stops at the curve's face, wherever along the curve it lands, and is no longer
  drawn over the curve. The 3D model, the section and the exports show the same corners.

## For agents

- The plan drawing, `grid draw`, `grid sheet`, the previews and the exports give a straight wall
  that meets a curved wall corner points on the curve's faces: the straight wall's and the curved
  wall's shapes share their end points. A partition ending on a curved wall's centre line, the
  curve's furthest point included, is joined to it and cut back to its face.
- No new code in the record.
