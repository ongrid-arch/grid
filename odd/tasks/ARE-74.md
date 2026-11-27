# ARE-74 Price the change between two versions

## Outcome

An agent can see how each bill quantity changes from the earlier plan to the later one and price both versions with the same rates.

## Design

- Compare two first estimates in the quantities layer by line key and unit. Show both quantities, their signed difference, the measurement rules and assumptions, and any quantities each estimate had to leave out.
- Price both versions from the same rate card using the estimate's existing rate matching, unit conversion and waste calculations. Keep the whole-building rate as an alternative. A line present on only one bill has zero measured quantity on the other.
- Let the estimate compare the current plan against a saved version or project file. Provide the same cost comparison in compare and diff when a rates file is requested.
- Let the change take-off take two files in earlier-to-later order. Combine them in memory with the same id pairing as the phase tool, then use the existing demolition, making good and new work rules.
- Support text, structured data and CSV in take-off. Resolve all paths through the project reader.

## Done

Exercise saved markers, separate plan files, opening deductions, added and removed lines, signed amounts, partial rates, CSV, and the cost output of compare and diff. Run the affected suites, the build, type check, lint and scoreboard.
