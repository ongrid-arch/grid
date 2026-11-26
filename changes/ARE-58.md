# 2026-11-26: the check counts each reason a part was left out (ARE-58)

## For people

- When a check left parts unlooked at for more than one reason, its line in the short report
  counts each reason on its own ("not looked at 23, by reason: 1, could not be drawn; 22, the plan
  states no ground level for the site"), so one part that could not be drawn is no longer read as
  every part left out (ARE-58).

## For agents

- The short report's coverage line for a check with several reasons reads `; not looked at {total}, by
  reason: {n}, {why}; {n}, {why}`. One reason reads as before. The record's `coverage[].skipped`
  already counted per reason and is unchanged. No new code in the record.
