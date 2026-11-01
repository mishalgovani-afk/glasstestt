"""Download the MediaPipe face landmarker model into hushcam/models (dev and CI builds)."""
import hashlib
import sys
import urllib.request
from pathlib import Path

from hushcam.lips import MODEL_NAME, MODEL_URL

SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"

dest = Path(__file__).parent / "hushcam" / "models" / MODEL_NAME
dest.parent.mkdir(parents=True, exist_ok=True)
if not dest.exists():
    print(f"Downloading {MODEL_URL}")
    urllib.request.urlretrieve(MODEL_URL, dest)
digest = hashlib.sha256(dest.read_bytes()).hexdigest()
if digest != SHA256:
    dest.unlink()
    sys.exit(f"Model checksum mismatch: {digest}")
print(f"Model OK: {dest}")
