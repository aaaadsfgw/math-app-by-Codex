"""Run a pinned, local formula OCR model against the committed PNG fixtures."""

import argparse
import ctypes
from ctypes import wintypes
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import socket
import sys
from time import perf_counter

ROOT = Path(__file__).resolve().parent
MODELS = ("PP-FormulaNet_plus-S", "PP-FormulaNet_plus-M", "Pix2Text-MFR-1.5", "pix2tex")
THREADS = 1


def sha256(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def memory():
    """Return current and peak process working sets in bytes on Windows."""
    class Counters(ctypes.Structure):
        _fields_ = [
            ("size", wintypes.DWORD), ("page_faults", wintypes.DWORD),
            ("peak_working_set", ctypes.c_size_t), ("working_set", ctypes.c_size_t),
            ("peak_paged_pool", ctypes.c_size_t), ("paged_pool", ctypes.c_size_t),
            ("peak_nonpaged_pool", ctypes.c_size_t), ("nonpaged_pool", ctypes.c_size_t),
            ("pagefile", ctypes.c_size_t), ("peak_pagefile", ctypes.c_size_t),
        ]
    kernel = ctypes.WinDLL("kernel32")
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
    counters = Counters()
    counters.size = ctypes.sizeof(counters)
    if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.size):
        raise ctypes.WinError(ctypes.get_last_error())
    return counters.working_set, counters.peak_working_set


def local_only():
    for key in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK",
                "DISABLE_MODEL_SOURCE_CHECK", "NO_ALBUMENTATIONS_UPDATE"):
        os.environ[key] = "1"
    for key in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
        os.environ[key] = str(THREADS)

    def deny_network(*_args, **_kwargs):
        raise RuntimeError("Network connections are disabled for OCR inference.")

    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.create_connection = deny_network


def load_paddle(model, weights):
    os.environ["PADDLE_PDX_CACHE_HOME"] = str(weights.parent / ".paddlex")
    import numpy as np
    from PIL import Image
    from paddleocr import FormulaRecognition

    recognizer = FormulaRecognition(
        model_name=model, model_dir=str(weights), device="cpu",
        cpu_threads=THREADS, enable_mkldnn=False,
    )

    def recognize(image_path):
        with Image.open(image_path) as image:
            bgr = np.asarray(image.convert("RGB"))[:, :, ::-1].copy()
        result, = recognizer.predict(input=bgr, batch_size=1)
        return result["rec_formula"]

    return recognize, ("paddlepaddle", "paddleocr", "paddlex", "numpy", "Pillow")


def load_pix2text(weights, device):
    import numpy as np
    import onnxruntime as ort
    from PIL import Image
    from tokenizers import Tokenizer

    processing = json.loads((weights / "preprocessor_config.json").read_text())
    generation = json.loads((weights / "generation_config.json").read_text())
    start_token = generation["decoder_start_token_id"]
    eos_token = generation["eos_token_id"]
    size = processing["size"]
    mean = np.asarray(processing["image_mean"], dtype=np.float32)
    std = np.asarray(processing["image_std"], dtype=np.float32)
    tokenizer = Tokenizer.from_file(str(weights / "tokenizer.json"))
    options = ort.SessionOptions()
    options.intra_op_num_threads = THREADS
    options.inter_op_num_threads = 1
    providers = ["CPUExecutionProvider"]
    if device == "directml":
        if "DmlExecutionProvider" not in ort.get_available_providers():
            raise RuntimeError("The isolated DirectML environment is required.")
        options.enable_mem_pattern = False
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        providers.insert(0, "DmlExecutionProvider")
    encoder = ort.InferenceSession(str(weights / "encoder_model.onnx"), options, providers)
    decoder = ort.InferenceSession(str(weights / "decoder_model.onnx"), options, providers)
    if any(model.get_providers()[0] != providers[0] for model in (encoder, decoder)):
        raise RuntimeError("ONNX Runtime did not initialize the selected execution provider.")

    def recognize(image_path):
        with Image.open(image_path) as image:
            pixels = np.asarray(image.convert("RGB").resize(
                (size["width"], size["height"]), processing["resample"],
            ), dtype=np.float32)
        pixels = ((pixels * processing["rescale_factor"] - mean) / std).transpose(2, 0, 1)[None]
        hidden, *_ = encoder.run(None, {"pixel_values": pixels})
        ids = [start_token]
        # The official export disables the KV cache. Greedy generation feeds
        # the full prefix for each token, as the published generation config does.
        for _ in range(generation["max_new_tokens"]):
            logits, *_ = decoder.run(None, {
                "input_ids": np.asarray([ids], dtype=np.int64), "encoder_hidden_states": hidden,
            })
            ids.append(int(np.argmax(logits[0, -1])))
            if ids[-1] == eos_token:
                return tokenizer.decode(ids, skip_special_tokens=True).strip()
        raise ValueError("Pix2Text reached its token limit before EOS")

    runtime = "onnxruntime-directml" if device == "directml" else "onnxruntime"
    return recognize, (runtime, "tokenizers", "numpy", "Pillow")


def load_pix2tex(weights):
    import torch
    from munch import Munch
    from PIL import Image
    from pix2tex import cli

    torch.set_num_threads(THREADS)
    torch.set_num_interop_threads(1)
    torch.manual_seed(20261112)
    # The upstream CLI writes every prediction to the operating-system clipboard.
    cli.clipboard.copy = lambda _text: None
    config = Path(cli.__file__).parent / "model" / "settings" / "config.yaml"
    recognizer = cli.LatexOCR(Munch(
        config=str(config), checkpoint=str(weights / "weights.pth"), no_cuda=True, no_resize=False,
    ))

    def recognize(image_path):
        with Image.open(image_path) as image, torch.inference_mode():
            return recognizer(image.convert("RGB"))

    return recognize, ("pix2tex", "torch", "torchvision", "Pillow", "numpy", "transformers", "timm")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("model", choices=MODELS)
    parser.add_argument("weights", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--context", action="store_true")
    parser.add_argument("--device", choices=("cpu", "directml"), default="cpu")
    parser.add_argument("--limit", type=int, help="Run only this many cases for an environment check.")
    args = parser.parse_args()
    if args.device == "directml" and args.model != "Pix2Text-MFR-1.5":
        parser.error("DirectML is supported by the Pix2Text runner only.")
    weights = args.weights.resolve(strict=True)
    manifest_path = ROOT / "data" / "manifest.json"
    manifest_text = manifest_path.read_text(encoding="utf-8")
    manifest = json.loads(manifest_text)
    rows = []
    lock = json.loads((ROOT / "models.lock.json").read_text(encoding="utf-8"))[args.model]
    for name, file in lock["files"].items():
        artifact = weights / name
        if artifact.stat().st_size != file["bytes"] or sha256(artifact) != file["sha256"]:
            raise ValueError(f"Weight file hash or size mismatch: {name}")

    local_only()
    baseline, _ = memory()
    start = perf_counter()
    if args.model == "Pix2Text-MFR-1.5":
        recognize, packages = load_pix2text(weights, args.device)
    elif args.model == "pix2tex":
        recognize, packages = load_pix2tex(weights)
    else:
        recognize, packages = load_paddle(args.model, weights)
    load_ms = (perf_counter() - start) * 1000

    for case in manifest["cases"]:
        if args.limit is not None and len(rows) >= args.limit:
            break
        if args.context and case["image"] == case["formulaImage"]:
            continue
        image = ROOT / "data" / case["image" if args.context else "formulaImage"]
        if sha256(image) != case["sha256" if args.context else "formulaSha256"]:
            raise ValueError(f"Fixture hash mismatch: {case['id']}")
        row = {"id": case["id"]}
        start = perf_counter()
        try:
            row["text"] = recognize(image)
        except Exception as error:
            row.update(text="", error=f"{type(error).__name__}: {error}")
        row["elapsed_ms"] = (perf_counter() - start) * 1000
        rows.append(row)
        print(case["id"], round(row["elapsed_ms"]), row.get("error", ""), flush=True)

    _, peak = memory()
    args.output.write_text(json.dumps({
        "model": args.model, "device": "cpu" if args.device == "cpu" else "gpu",
        "provider": "DirectML with CPU fallback" if args.device == "directml" else None,
        "context": args.context,
        "context_mode": "standalone-full-image" if args.context else None, "threads": THREADS,
        "runtime": {package: version(package) for package in packages},
        "platform": platform.platform(), "python": platform.python_version(),
        "model_id": lock["revision"], "fixture_sha256": hashlib.sha256(manifest_text.encode()).hexdigest(),
        "load_ms": load_ms, "baseline_rss_bytes": baseline, "peak_rss_bytes": peak,
        "memory_scope": "Windows process PeakWorkingSetSize; excludes GPU VRAM",
        "rows": rows,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0 if any(row["text"] for row in rows) else 1


if __name__ == "__main__":
    sys.exit(main())
