# 2026-11-25: a dividing line joins two rooms and nothing else (ARE-28)

## For people

- A dividing line between two rooms is no longer taken as a way outside where it runs on beside one room only, into the wall it meets or past the end of a narrower room. A ring of corridors round a courtyard joined at its corners by dividing lines, with no door out, now says it has no way out, and a stand in the middle of a hall no longer finds the outside a few metres away along a line. Rooms text now ends each dividing line where its two rooms stop sharing an edge. The route out from a floor that nothing joins to the ground floor says there is no way out from that floor, and why (ARE-28).

## For agents

- `grid_check` and `grid check`: a virtual wall with two different rooms on its sides along any stretch is a dividing line, and along its stretches with one room only it is no way out, no open edge and no door into a space not drawn, unless the plan states its `beyond`. Plans that relied on such a stretch as their way out now get `floor/no-exit` (or `room/no-route-out`). An open edge, a virtual wall with one room all along it, leads out as before. `grid_measure what=route`, `grid describe` and the access measures read the same ways out.
- `grid write` and `grid_write`: a dividing line written from rooms text ends at the edge its two rooms share, no longer at the centre line of the wall it meets, so its `start` and `end` move by up to half that wall's thickness. Areas and room outlines are unchanged.
- `grid_measure what=route` to the outside, from a floor above the ground with no stair, lift or ramp to it: the text adds a line saying there is no way out from that floor and why (`grid check: floor/no-stair`), and `answer` carries `noStair` (`floor`, and `from`, the ground floor a stair would rise from). No new code in the record.
