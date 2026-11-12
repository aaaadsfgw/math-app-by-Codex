"""Download the official, pinned model files into a caller-chosen cache."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

LOCK = json.loads(Path(__file__).with_name("models.lock.json").read_text(encoding="utf-8"))


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def verified(path, file):
    return path.is_file() and path.stat().st_size == file["bytes"] and digest(path) == file["sha256"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("model", choices=LOCK)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    for name, file in LOCK[args.model]["files"].items():
        output = args.destination / name
        if verified(output, file):
            continue
        temporary = output.with_suffix(output.suffix + ".download")
        try:
            with urlopen(file["url"], timeout=120) as response, temporary.open("wb") as destination:
                total = 0
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > file["bytes"]:
                        raise ValueError(f"Unexpected file size for {name}")
                    destination.write(chunk)
            if not verified(temporary, file):
                raise ValueError(f"Size or SHA-256 mismatch for {name}")
            temporary.replace(output)
            print(f"Verified {name}")
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
