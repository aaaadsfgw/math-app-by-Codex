# Math Study Log AI

Math Study Log AI is a build-free Manifest V3 Chrome extension for high-school mathematics. It combines small, verifiable JavaScript solvers with a local Ollama model, then records whether the learner solved a problem independently, after a hint, during working, or only after seeing an answer.

## Main features

- Input a problem in the popup or capture selected text from a normal web page.
- Request an answer, two levels of hints, working steps, or a full explanation.
- Verify supported calculations locally before showing a “verified” label.
- Use `qwen3:8b` through local Ollama for natural-language hints and unsupported questions.
- Copy the result with `Ctrl+Shift+Y` (`Command+Shift+Y` on macOS).
- Save learning history, change self-assessment later, import/export JSON, and identify review items.
- Inspect overall and category-level understanding, answer-view rate, and hint dependence.
- Enter geometry conditions on SVG templates without inferring mathematics from the drawing.

## Screens

| Screen | Purpose |
| --- | --- |
| `popup.html` | Enter/capture a problem, select a mode, solve, copy, and assess |
| `history.html` | Filter, sort, edit, delete, import, and export history |
| `analytics.html` | View real history-based learning metrics and CSS bar charts |
| `review.html` | Prioritize and retry low-scoring or unverified work |
| `geometry.html` | Build structured geometry data and calculate supported triangles |
| `settings.html` | Configure Ollama, defaults, history, demo behavior, and data removal |
| `examples.html` | Send representative supported and unsupported examples to the popup |
| `help.html` | Read setup, usage, scoring, limitations, and troubleshooting guidance |
| `about.html` | Understand the design, privacy model, and current scope |

## Install the extension

1. Open `chrome://extensions` in Chrome.
2. Turn on Developer mode.
3. Choose **Load unpacked** and select this repository folder.
4. Pin Math Study Log AI to the toolbar if desired.

The extension is plain HTML/CSS/JavaScript and has no build step or runtime package dependency.

## Install Ollama and qwen3:8b on Windows

Download Ollama from the [official download page](https://ollama.com/download) or the [Windows download page](https://ollama.com/download/windows), install it, then run:

```powershell
ollama --version
ollama pull qwen3:8b
ollama run qwen3:8b
ollama ps
```

The supported endpoint is `http://localhost:11434/api/chat`; `127.0.0.1` on the same port is also permitted. Other URLs may be entered for visibility but cannot be reached without changing manifest permissions, so the settings screen rejects unsupported hosts.

## Output modes and verification labels

- **Answer** returns the final result. Showing it initializes self-assessment to “answer seen” (0 points).
- **Hint 1** gives only the first idea; **Hint 2** gives a formula or next transformation without the final result.
- **Steps** includes concise transformations and the answer.
- **Explanation** includes category, method, working, answer, and a check.

“Verified by local solver” means the application computed and checked the result. “Demo data” is a fixed demonstration and is not the same as verification. “AI answer — unverified” means Ollama produced the content and the application could not mathematically verify it.

## Learning log and scores

Self solved is 100, hint 1 is 80, hint 2 is 60, steps is 40, explanation understood is 30, and answer seen or unsolved is 0. Unassessed records have no score. Records at 60 or below, unassessed records, answer-mode records, AI-only records, and repeated low category results are included in review.

History is stored in `chrome.storage.local`. History JSON export stays on the device and excludes settings and geometry drafts. Import validates the top-level shape and normalizes records before merging. Because an imported file cannot prove that a solver actually ran, imported “verified” claims are downgraded to unverified until the question is solved again. All application data can be removed from Settings.

## Solver coverage

The initial local solvers cover:

- Linear equations in `x`, including simple parentheses, no solution, and infinitely many solutions.
- Quadratic equations with real distinct, repeated, or irrational roots. Negative discriminants are reported as having no real solution.
- Binary notation such as `1011(2)` or `110101₂` converted to decimal.
- Percentage-of problems such as `800円の25%`.
- Distance and midpoint for two Cartesian points.
- Triangle remaining angle, perimeter, base-height area, two-sides-included-angle area, Pythagorean calculation, Heron area, and basic isosceles/equilateral conditions.

Contradictory angles, invalid lengths, and triangle inequality failures return an error instead of a result. Systems of equations, exponentials, logarithms, trigonometric equations, calculus, limits, sequences, probability, vectors, proofs, complex figures, and arbitrary symbolic expressions are not locally verified.

## Geometry editor

Nine templates are available: general, right, isosceles, and equilateral triangles; circle; circle and tangent; parallel lines with transversal; quadrilateral; and coordinate plane. All templates can be displayed and edited. Triangle conditions can be calculated when sufficient supported values are entered. Other templates and advanced constraints currently generate structured data but are clearly labeled as not yet solver-supported.

Display coordinates never become mathematical measurements. Enter side lengths and angles explicitly.

## Demo mode

Demo mode responds only to a documented fixed set, including `2x + 3 = 11`, `x^2 - 5x + 6 = 0`, `1011(2)`, `800円の25%`, a 5–7–60° triangle area, and the distance from A(1,2) to B(4,6). A local solver still handles supported inputs when demo mode is off. When Ollama is stopped and demo mode is off, unsupported problems show an error rather than a fabricated demo answer.

## Privacy and permissions

Problems are sent only to the locally configured Ollama endpoint. The extension uses `storage`, `activeTab`, `scripting`, and `clipboardWrite`. It deliberately does not request `clipboardRead`. The selection helper is injected only after a popup action or shortcut grants temporary `activeTab` access; it does not run permanently on every page. Selection capture works on ordinary HTTP/HTTPS pages, while Chrome internal pages and some embedded viewers do not allow content scripts.

## Tests and checks

Node.js is used only for development checks:

```powershell
npm test
npm run check
```

The tests cover solver examples, contradictory inputs, answer parsing, classification, and storage/analytics behavior. The project check validates the manifest, referenced files, imports, JavaScript syntax, permission boundaries, external JavaScript URLs, unfinished markers, and empty files.

Automated checks do not replace loading the unpacked extension in Chrome. Follow `docs/test-plan.md` for the manual popup, shortcut, Ollama, persistence, analysis, and geometry flow.

## Troubleshooting

- **Ollama connection failed:** start Ollama, confirm `qwen3:8b` is installed, and restore the supported URL.
- **No selected text:** select a non-empty problem on a normal web page; the extension does not read the clipboard as a fallback.
- **Unverified answer blocked:** enable unverified AI answers only if you understand that they require independent checking.
- **Shortcut unavailable:** Chrome may reserve or reassign a shortcut; check `chrome://extensions/shortcuts`.

## Next improvements

The highest-value follow-ups are full unpacked-Chrome automation, service-worker cold-start/long-response testing, broader symbolic solvers, richer structured geometry solving, and accessible SVG keyboard editing.
