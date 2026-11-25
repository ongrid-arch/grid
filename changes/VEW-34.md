# 2026-11-25: a room under a void is as high as the space over it, in section (VEW-34)

## For people

- A section through a double-height room now labels it with its full height: a room under a
  room on the floor above marked as a void is drawn up through the void to the slab or roof over
  it, so a living room under a void reads 5.65 m, not its storey's 2.70 m. Voids one over another
  are risen through in turn. Where the void is over only part of the room on the line, the room
  is labelled where most of it stands. A room that states its own height keeps it, and the void
  itself is no longer labelled as a room of its own over the room that rises through it (VEW-34).

## For agents

- `grid_view kind=section` (and `grid draw --section`): a room cut that states no height, under
  a void over more than half of its stretch on the line, has its `height` from its floor up to the
  top of the void's storey (the slab or roof over the void), through every void stacked over it,
  and "Rooms cut, floor to ceiling" says that height. The core's `SectionRoom` has `through`, the
  void rooms it rises through, and its `from`/`to` are then the part under them. Those voids are
  left out of the rooms cut. Such rooms are listed in their own `room-height` note ("stand under a
  void … drawn up through it to what is over it"), not in the note for rooms drawn up to their
  storey. No new code in the record.
