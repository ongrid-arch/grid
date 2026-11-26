# 2026-11-26: the plan's revision on every answer, and based_on on every change (CMD-41)

## For people

- Two agents, or two Grid tool servers, changing one plan at the same time no longer lose a change: each change waits for the other and works on the plan as it left it. An agent can also say which revision of the plan it read, and a change is refused, with what changed since, when the plan moved on (CMD-41).

## For agents

- Every answer about a plan carries `planRevision` in its data (listed in every output schema) and a last text block, `"plan.json" is at revision <12 hex digits>. ...`. Every tool that changes the plan takes `based_on`: when the plan is no longer at that revision the change is refused with nothing written, `The plan changed since you read it: ...`, the revision it is at now and, when the server read that version, `What changed since then: <the grid_diff verdict>`. A change holds `<plan>.lock` beside the plan while it reads and writes; one held by another process for 30 s is refused, to be tried again. No new code in the record.
