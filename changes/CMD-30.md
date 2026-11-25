# 2026-11-25: names and file permissions are guarded (CMD-30)

## For people

- A name with a character that shows nothing, such as a zero-width space, is refused, as a
  control or direction character already is (CMD-30).
- A room, floor, flat or plan name that reads as an instruction or a claim ("Ignore previous
  instructions", "Approved"), or may hold a person's name ("Mr Smith office", "Dormitorio de
  Lucía"), is kept as written, and the write or change that brought it in says so, once.
- Names and searches are read in one Unicode form, so `Baño` typed with a combining tilde is the
  same `Baño`, and a search finds it however it was typed.
- Files Grid writes follow your umask (0644 by default) instead of being readable by you only; a
  file Grid replaces keeps its mode, and a file you made read-only is refused and left as it is.

## For agents

- Tool arguments that are not ids are read in NFC, and `grid_find`, `grid_count` and
  `grid_fields` compare text in NFC, so a decomposed letter in a call or in an older plan still
  matches.
- An argument holding an invisible character (U+200B, U+2060 to U+2064, U+00AD, U+FEFF inside the
  text, the Hangul fillers, tag characters and the like; ZWJ and ZWNJ stay allowed) is refused:
  `<arg> holds a control, direction or invisible character.` A plan file with one in a name or an
  id is refused when read: `holds an invisible character (U+200B), which can hide text or make one
  name look like another`.
- The answers of `grid_write_rooms` and of the tools that change the plan add at most three lines
  for names the plan did not have before: `The name of a room, "<name>", reads as an instruction
  or as a claim about the plan. …` or `The name of a room, "<name>", may hold a person's name. …
  ("<plan>.occupancy.json").` Nothing is refused for them; the data is unchanged.
- A read-only plan is refused before the change is worked out: `<plan> was not written: it is
  read-only, so Grid leaves it as it is.` from `grid_write_rooms` (rooms text or a scan), and
  `Can't write "<plan>": it is read-only, so Grid leaves it as it is` from the edits.
- No new code in the record.
