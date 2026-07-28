# User manual

## Solve from the popup

Open the extension, type a problem or capture selected text, choose one of five modes, and run the analysis. Read the verification badge before relying on the result. Copy if needed, then record the stage at which you solved the problem.

## Solve a web selection

Select a complete problem on an ordinary HTTP/HTTPS page and press `Ctrl+Shift+Y` (`Command+Shift+Y` on macOS). The page shows a persistent “analyzing” toast. On success the final answer is copied and the toast changes for about 3.5 seconds. No selection produces an error and does not inspect existing clipboard data.

## Revisit and review

History supports category/mode/review filters and three sort orders. A shortcut record can be assessed later. Review lists low-scoring, unassessed, answer-mode, unverified, and repeatedly weak categories. “Solve again” sends the original question and parent record ID to the popup.

## Use geometry

Select a template, drag points for a clearer drawing, and enter side/angle conditions explicitly. Add or remove conditions and choose a requested quantity. Only values in the conditions list are used in calculation. Save stores a structured draft locally.

## Data management

History export downloads only learning records as JSON; it does not include settings or geometry drafts. Import merges valid normalized records and ignores duplicate IDs. Imported verification claims are downgraded because files can be edited outside the extension. Solve an imported question again to create a new verified record. Settings can reset preferences or remove all application data after confirmation.

## Interpreting labels

- Verified local solver: checked by deterministic code.
- Demo data: a fixed demonstration, not general validation.
- AI answer — unverified: generated locally but not mathematically checked.
- Automatic verification unavailable: no supported verified result was produced.
