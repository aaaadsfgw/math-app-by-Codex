# Test plan

## Automated

Run `npm test`, then `npm run check`. The first command verifies representative calculations, contradictions, parsing, classification, and storage behavior. The second verifies extension structure and static policy boundaries.

## Manual unpacked-Chrome sequence

1. Load this repository through `chrome://extensions` and confirm all nine pages open without console errors.
2. With Ollama stopped and demo mode off, solve `2x + 3 = 11`; confirm local verified `x=4` still works.
3. Start Ollama with `qwen3:8b`; request a hint for an unsupported problem and confirm the badge says AI/unverified and does not reveal a final answer in Hint 1.
4. On a normal page, select `2x + 3 = 11` and press the command shortcut. Confirm the analyzing toast persists until completion, the answer is copied, and a history record appears.
5. Press the shortcut with no selection. Confirm the page says to select a problem and existing clipboard contents are not used.
6. Change the shortcut record’s assessment in History, reload the page, and confirm persistence.
7. Confirm Analytics uses the saved records and the 7/30-day counts change without sample data.
8. Use “solve again” in Review, open the popup, and confirm the question plus parent link are preserved in the new record.
9. In Geometry, set AB=5, AC=7, angle A=60 and request area. Confirm `35√3/4` (or its valid numeric equivalent) and a verified local-solver label.
10. Enter contradictory triangle conditions and confirm no answer is produced.
11. Export history, clear it, import the export, and confirm normalized records return.
12. Test narrow popup and a narrow full-page viewport with keyboard-only navigation and visible focus.

## Long-response check

Run an uncached Ollama request near the configured timeout. Keep the page and service worker console visible. Confirm the pending state remains accurate and the error is actionable if Chrome suspends or the timeout aborts.

