"""Pinned Pix2Text MFR 1.5 ONNX preprocessing and greedy decoding."""

import hashlib
import json
from pathlib import Path

LOCK_PATH = Path(__file__).resolve().parents[2] / "bench" / "ocr" / "models.lock.json"
MODEL_NAME = "Pix2Text-MFR-1.5"
THREADS = 1


def verify_model(directory):
    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))[MODEL_NAME]
    for name, artifact in lock["files"].items():
        path = directory / name
        if path.stat().st_size != artifact["bytes"]:
            raise ValueError(f"Pix2Text file size mismatch: {name}")
        with path.open("rb") as source:
            if hashlib.file_digest(source, "sha256").hexdigest() != artifact["sha256"]:
                raise ValueError(f"Pix2Text SHA-256 mismatch: {name}")
    return lock["revision"]


def load_model(weights, device="cpu"):
    import numpy as np
    import onnxruntime as ort
    from tokenizers import Tokenizer

    processing = json.loads((weights / "preprocessor_config.json").read_text(encoding="utf-8"))
    generation = json.loads((weights / "generation_config.json").read_text(encoding="utf-8"))
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

    def recognize(image):
        pixels = np.asarray(image.convert("RGB").resize(
            (size["width"], size["height"]), processing["resample"],
        ), dtype=np.float32)
        pixels = ((pixels * processing["rescale_factor"] - mean) / std).transpose(2, 0, 1)[None]
        hidden, *_ = encoder.run(None, {"pixel_values": pixels})
        ids = [start_token]
        # The official export disables the KV cache. Feed the full prefix to
        # the decoder at each step using the pinned greedy generation config.
        for _ in range(generation["max_new_tokens"]):
            logits, *_ = decoder.run(None, {
                "input_ids": np.asarray([ids], dtype=np.int64), "encoder_hidden_states": hidden,
            })
            ids.append(int(np.argmax(logits[0, -1])))
            if ids[-1] == eos_token:
                return tokenizer.decode(ids, skip_special_tokens=True).strip()
        raise ValueError("Pix2Text reached its token limit before EOS")

    return recognize
