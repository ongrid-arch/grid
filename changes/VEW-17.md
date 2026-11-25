# 2026-11-25: notes and the label stay off the drawing (VEW-17)

## For people

- A note or tag on a plan is now a small number on the drawing, and its words are listed under the
  drawing, numbered, so a note never covers a wall, a door or the edge of the page (VEW-17).
- "General guidance, not your local rules" is written in a caption band under every picture
  (plans, 3D stills, views from inside a room, plans side by side, sections and facades) and no
  longer over the drawing. The PNG also carries it in its own metadata (a `Description` text chunk).
- A line about the whole plan or floor (such as "read after the work" on a drawing with phases) is
  in the list under the drawing and no longer a mark in its corner. A comparison's key is in a band
  under the drawing, not over its corner.

## For agents

- Pictures are taller than before by the caption band (about 26 px on a plan, more on a wide
  still): the `height` of a picture answer includes it, and the drawing's own pixels, `boxes` and
  `pxPerMetre` are unchanged because the band is only below. Notes in the SVG carry `data-number`
  on a `note-note` or `note-tag` group, and their words are in the band's `notes-text` lines.
  The `label` still comes with every answer. No new code in the record.
