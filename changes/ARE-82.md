# 2026-11-28: each floor's depth below the ground, formation level, retained height and dig (ARE-82)

## For people

- A basement, a car park under a building or a floor cut into a slope is measured against the
  ground round it in one answer: how deep its floor is, its formation level and how deep that
  is, the earth its walls hold on each side, its area below the ground and the earth dug out
  under it, with the excavation in all, so no depth table is worked out by hand. `grid describe`
  says a floor is below the ground and how deep (ARE-82).

## For agents

- `grid_measure`: new `what=ground`, taking no other argument. Its `answer.floors` lists each
  floor below the ground with `level`, `ground` and `depth` (each `low` and `high`, the lowest
  and the highest ground under its outer walls), `below` (`wholly` or `partly`), `formation`
  (`level` and `depth`, or null with no slab on the ground), `retained` by compass `side` with
  `height`, `area` and `walls`, `area` (its gross external area) and `dig` (`area`, `depth`,
  `volume`, or null); `excavation` in m³, `state: assumed`, the plan's `north` and `yAxis`, and
  its rule. A plan with no floor below the ground answers one line and `floors: []`.
- `grid_describe`: a floor below the ground adds "Its floor is 3.2 m below the ground." to its
  line for a person (a range on a slope) and `below-ground 3.2` (or `0-2.1`) after its level for
  an agent. No new code in the record.
