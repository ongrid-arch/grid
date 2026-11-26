# 2026-11-26: room uses and building kinds beyond homes and offices (CNT-40)

## For people

- A room can now be a platform, concourse, ticket hall, check-in, security or gate; a ward, an
  operating theatre or an anteroom; a gallery, auditorium, stage, foyer, library, cafe or bar; a
  break-out, print, comms, phone booth, focus, wellbeing or training room; a lab, a cleanroom, a
  cell or a food-prep area. Area by use groups them, and each has a name in English and Spanish and
  its own colour in the drawing. Old words such as parlour and box room are read as the use they
  mean, and the word you wrote stays the room's name.
- A building can be a block of flats, a transport, culture, lab or custody building. Writing the
  kind as a plain word (hospital, apartments, airport, museum, prison) is read as the kind instead
  of refused. The checks read for homes cover flats.
- A floor below ground is no longer said to overhang the floor above or to sit back from the floors
  under it.

## For agents

- Plan format: a room's `use` takes 27 more values (`platform`, `concourse`, `ticketing`,
  `checkin`, `security`, `gate`, `ward`, `operating`, `anteroom`, `gallery`, `auditorium`, `stage`,
  `foyer`, `library`, `cafe`, `bar`, `breakout`, `print`, `comms`, `phonebooth`, `focus`,
  `wellbeing`, `training`, `lab`, `cleanroom`, `cell`, `prep`) and the `building` of a plan or floor
  five more (`flats`, `transport`, `culture`, `lab`, `custody`). Plain words are read as them
  (`bed bay`, `theatre`, `laboratory`, `hospital`, `apartments`); `parlour`, `parlor`, `sitting` and
  `box` are read as `living` and `bedroom`, the only words that are. Rooms text accepts the same
  words after `building`.
- `grid_areas` and every list by use carry the new uses; the figure checks run in `flats` as in
  `home` and skip the other new kinds with their usual "not read for" line.
- `floor/out-of-line` and `floor/set-back` are not said of a floor with a negative `level`, nor
  against floors below ground.
- No new code in the record.
