# CNT-40: room uses and building kinds beyond homes and offices

## Outcome

- A person or an agent can state the use of a room in a station, a hospital ward, a gallery, a
  library, a lab, a cleanroom, a cell, a restaurant kitchen or an open-plan office, and area by use
  groups them: a platform is a `platform`, a bed bay a `ward`, a gallery a `gallery`, no longer
  `other` or a bedroom.
- A plan may say its building is `transport`, `culture`, `lab`, `custody` or `flats`, and
  `building hospital`, `building flats` or `building station` is read as the kind it means instead
  of being refused. The figure checks, read for homes, cover `flats` and skip the other new kinds
  with the line they already write.
- Old and regional words (`parlour`, `boxroom`) are read as the use they mean and the person's
  word stays the room's name.
- A floor below ground is never said to overhang or to sit back from the floors under it.

## Design

- `ROOM_USES` (`types/floorplan.ts`) gains, in groups: transport `platform`, `concourse`,
  `ticketing`, `checkin`, `security`, `gate`; health `ward`, `operating`, `anteroom`; culture
  `gallery`, `auditorium`, `stage`, `foyer`, `library`, `cafe`, `bar`; workplace `breakout`,
  `print`, `comms`, `phonebooth`, `focus`, `wellbeing`, `training`; and `lab`, `cleanroom`, `cell`,
  `prep` (restaurant back of house). Every list keyed by use (labels, the colour fills, the
  estimate's words) gets an entry: the type check fails until it has one.
- `USE_LABELS` (`messages/uses.ts`) gives each a label in English and Spanish; labels are read as
  the use in any case and with any accents (`Café`, `check-in`).
- `USE_WORDS` gains the plain words (`wards`, `laboratory`, `exhibition`, `cells`, `buffet`...), each
  meaning one use. The old words `parlour`, `parlor` and `sitting` read as `living`, `box` (from
  `boxroom`) as `bedroom`: the one place a word is read as a use the figure checks look at, because
  the person wrote it as the use of the room. `lounge`, `hall` and `studio` stay unread.
- `BUILDING_TYPES` gains `flats`, `transport`, `culture`, `lab`, `custody`, each with its sentence
  (`check.building.*`, en and es). `READ_FOR_BUILDINGS.homes` covers `flats`. `readBuilding` reads a
  word for a kind (`hospital`, `apartments`, `airport`, `museum`, `prison`) as the kind; rooms text
  and the report draft use it.
- A firm's own use list: its words reach a known use through the plan's own word list, already
  `USE_WORDS` and the label reading; nothing more is built for it.
- `stacking.ts`: a floor with a negative `level` is not judged against the floors under it, and a
  floor is not set against floors below ground.
- Outside the area, small: `viewer/src/picture/look.ts` (a fill per use) and
  `cli/src/quantities/estimate.ts` (words per use), both required by the type check.

## Done

- `uses.test.ts`-style tests: every new use has labels in both languages; the words read; the old
  words read and the name stays.
- Building words read in rooms text and by `readBuilding`; flats run the figure checks.
- A basement wider or narrower than the ground floor says nothing; an upper floor still does.
- `tsc` for the packages touched, lint, the touched tests, `ownWords.test.ts`, `tolerances.test.ts`.
