# Architecture

```text
popup / shortcut / review / geometry
          |
          v
 category-classifier ---> solver/index ---> specialized solver ---> verification
          |                    |
          | unsupported        | verified result
          v                    v
 prompt-builder ----------> presentation
          |
          v
 ollama-client ---> answer-parser ---> unverified presentation
          |
          v
       storage ---> history / analytics / review
```

## Runtime components

- `background.js` owns the Commands API flow and coordinates the active tab.
- `content-script.js` is injected on demand under temporary `activeTab` access. It reads the current non-password selection, renders status toasts, and performs user-gesture-adjacent clipboard writes. It never reads the clipboard and is not declared as an all-page resident script.
- `popup.js` coordinates typed/selected input, modes, solver-first processing, result evidence, copy, and assessment.
- `storage.js` normalizes persisted values and provides the only storage interface to pages.
- `solver/index.js` routes to isolated deterministic solvers. Solver modules return one common result shape.
- `ollama-client.js` sends one stateless request with a timeout. It has no cloud fallback.

## Geometry separation

Geometry documents have independent `points` for SVG display and `constraints` for mathematics. Dragging a point mutates only a display coordinate. Solvers consume explicit constraints and the query.

## Failure behavior

Unsupported input is a normal result, not a verification failure. A solver contradiction, disallowed unverified AI answer, Ollama connection error, and content-script injection restriction are distinct user-visible errors. Shortcut requests cap Ollama waiting at 25 seconds so the service worker can replace the loading toast with an actionable timeout; popup requests retain the configured longer timeout.
