"""Private, bounded stdio interface for the Windows Electron main process."""

import base64
import ctypes
from ctypes import wintypes
from io import BytesIO
import json
import os
from pathlib import Path
import re
import socket
import sys
from time import perf_counter

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 16 * 1024 * 1024
MAX_IMAGE_DIMENSION = 8192
MAX_LATEX_CHARACTERS = 4096
MAX_REQUEST_BYTES = 4 * ((MAX_IMAGE_BYTES + 2) // 3) + 128
REQUEST_ID = re.compile(r"[1-9][0-9]{0,15}")


def local_only():
    os.environ.update(
        HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", TOKENIZERS_PARALLELISM="false",
        OMP_NUM_THREADS="1", MKL_NUM_THREADS="1", OPENBLAS_NUM_THREADS="1",
    )

    def deny_network(*_args, **_kwargs):
        raise RuntimeError("Network connections are disabled for OCR inference.")

    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.create_connection = deny_network
    socket.getaddrinfo = deny_network


def working_set():
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
        return 0, 0
    return counters.working_set, counters.peak_working_set


def request(line):
    payload = json.loads(line)
    if (type(payload) is not dict or payload.keys() != {"id", "image"} or
            not isinstance(payload["id"], str) or REQUEST_ID.fullmatch(payload["id"]) is None or
            not isinstance(payload["image"], str)):
        raise ValueError("Invalid Pix2Text request")
    png = base64.b64decode(payload["image"], validate=True)
    if not png.startswith(b"\x89PNG\r\n\x1a\n") or len(png) > MAX_IMAGE_BYTES:
        raise ValueError("Invalid Pix2Text image")
    return payload["id"], png


def send(response):
    print(json.dumps(response, ensure_ascii=True, separators=(",", ":")), flush=True)


def serve(weights):
    from pix2text_model import load_model, verify_model

    recognize = None
    revision = None
    while line := sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1):
        if len(line) > MAX_REQUEST_BYTES or not line.endswith(b"\n"):
            raise ValueError("Oversized Pix2Text request")
        request_id, png = request(line)
        load_ms = 0
        if recognize is None:
            start = perf_counter()
            try:
                from PIL import Image

                revision = verify_model(weights)
                recognize = load_model(weights)
            except Exception as error:
                send({"id": request_id, "code": "OCR_MODEL_LOAD_FAILED",
                      "detail": f"{type(error).__name__}: {error}"[:500]})
                return 1
            load_ms = (perf_counter() - start) * 1000
        try:
            start = perf_counter()
            with Image.open(BytesIO(png), formats=["PNG"]) as image:
                width, height = image.size
                if (not 0 < width <= MAX_IMAGE_DIMENSION or not 0 < height <= MAX_IMAGE_DIMENSION or
                        width * height > MAX_IMAGE_PIXELS or image.n_frames != 1):
                    raise ValueError("Invalid PNG dimensions or frame count")
                latex = recognize(image)
            if not latex or len(latex) > MAX_LATEX_CHARACTERS:
                raise ValueError("Pix2Text did not return a bounded LaTeX result")
            inference_ms = (perf_counter() - start) * 1000
            current, peak = working_set()
            send({"id": request_id, "latex": latex, "metrics": {
                "modelRevision": revision, "loadMs": load_ms, "inferenceMs": inference_ms,
                "workingSetBytes": current, "peakWorkingSetBytes": peak,
            }})
        except (MemoryError, RuntimeError):
            send({"id": request_id, "code": "OCR_WORKER_FAILED"})
            return 1
        except (ValueError, OSError):
            send({"id": request_id, "code": "OCR_RECOGNITION_FAILED"})
    return 0


if __name__ == "__main__":
    local_only()
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    if len(sys.argv) == 3:
        sys.path.append(sys.argv[2])
    sys.exit(serve(Path(sys.argv[1])))
