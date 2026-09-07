# ONNX Runtime Web vendor files

This directory contains the browser runtime files from `onnxruntime-web@1.22.0`:

- `ort.webgpu.bundle.min.mjs`
- `ort-wasm-simd-threaded.jsep.wasm`

They are bundled with the extension so OCR never needs a CDN or network request.
The upstream project is ONNX Runtime by Microsoft and is distributed under the
MIT license included in `LICENSE`.

Pinned SHA-256 values are enforced by `scripts/check-project.mjs`.
