# 2026-11-25: a CAD, PDF or picture file is named for what it is (CMD-20)

## For people

- Handing Grid a DXF, DWG, IFC, PDF, PNG or JPEG file where it wants a plan now says what the file
  is and that Grid does not read it yet, with what to do instead (write the rooms as rooms text,
  or lay a picture under a plan as a trace), instead of a fault about JSON or UTF-8 (CMD-20).

## For agents

- Every command and tool that reads a plan file recognises a DXF, DWG, IFC, PDF, PNG or JPEG file
  by its first bytes, whatever its name, and refuses it in one line naming the kind, saying Grid
  does not read it yet and pointing to `grid write` (rooms text) or, for a picture, `referenceImage`.
  No new code in the record.
