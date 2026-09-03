"""Admin branding: logo upload -> multi-platform asset generation.

Filesystem + manifest only, no DB session. All functions take base_dir so
tests can isolate on tmp_path and never touch the real static folder.
"""

import io
import json
import shutil
import time
import uuid
from pathlib import Path

from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "static" / "branding"

ALLOWED_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAX_BYTES = 5 * 1024 * 1024

LOGO_URL_PREFIX = "/api/static/branding/logo-header.png"

# name -> (width, height); maskable gets special padding, see generate_variants
SIZES = {
    "logo-header.png": (256, 256),
    "icon-192.png": (192, 192),
    "icon-512.png": (512, 512),
    "apple-touch-icon.png": (180, 180),
    "favicon-64.png": (64, 64),
}


class BrandingError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def validate_upload(content: bytes, content_type: str | None, filename: str) -> str:
    ext = ALLOWED_TYPES.get((content_type or "").lower())
    if ext is None:
        # Fall back to filename extension so a missing MIME still works.
        suffix = Path(filename or "").suffix.lower()
        ext = {".png": ".png", ".jpg": ".jpg", ".jpeg": ".jpg", ".webp": ".webp"}.get(suffix)
    if ext is None:
        raise BrandingError("unsupported_type", "Only PNG, JPG and WebP images are accepted")
    if len(content) > MAX_BYTES:
        raise BrandingError("too_large", "Image must be 5MB or smaller")
    try:
        with Image.open(io.BytesIO(content)) as im:
            im.verify()
    except Exception:
        raise BrandingError("corrupt_image", "File is not a readable image")
    return ext


def load_square_image(content: bytes) -> Image.Image:
    """Re-open verified bytes and center-crop to a square RGBA image."""
    try:
        img = Image.open(io.BytesIO(content)).convert("RGBA")
    except Exception:
        raise BrandingError("corrupt_image", "File is not a readable image")
    side = min(img.size)
    left = (img.size[0] - side) // 2
    top = (img.size[1] - side) // 2
    return img.crop((left, top, left + side, top + side))


def generate_variants(img: Image.Image) -> dict[str, Image.Image]:
    variants = {name: img.resize(size, Image.LANCZOS) for name, size in SIZES.items()}
    maskable = Image.new("RGBA", (512, 512), (255, 255, 255, 255))
    art = img.resize((410, 410), Image.LANCZOS)  # ~48px safe-zone padding
    maskable.alpha_composite(art, (51, 51))
    variants["icon-maskable-512.png"] = maskable.convert("RGB")
    rgb_variants = {}
    for name, im in variants.items():
        rgb_variants[name] = im.convert("RGB") if im.mode == "RGBA" else im
    return rgb_variants


def _manifest_path(base_dir: Path) -> Path:
    return base_dir / "manifest.json"


def save_branding(variants: dict[str, Image.Image], actor_id: str, base_dir: Path = BASE_DIR) -> dict:
    base_dir.mkdir(parents=True, exist_ok=True)
    backup = base_dir / ".backup"
    existing = [p for p in base_dir.glob("*.png") if p.is_file()]
    if existing and not backup.exists():
        backup.mkdir(parents=True, exist_ok=True)
        for p in existing:
            shutil.copy2(p, backup / p.name)

    version = int(time.time())
    staging = base_dir / f".staging-{uuid.uuid4().hex}"
    staging.mkdir(parents=True)
    for name, im in variants.items():
        im.save(staging / name, format="PNG")
    for name in variants:
        (staging / name).replace(base_dir / name)
    shutil.rmtree(staging, ignore_errors=True)

    manifest = {"version": version, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "updated_by": actor_id}
    _manifest_path(base_dir).write_text(json.dumps(manifest))
    return {"logo_url": f"{LOGO_URL_PREFIX}?v={version}", "version": version}


def read_branding(base_dir: Path = BASE_DIR) -> dict:
    try:
        manifest = json.loads(_manifest_path(base_dir).read_text())
        version = int(manifest["version"])
        return {
            "logo_url": f"{LOGO_URL_PREFIX}?v={version}",
            "version": version,
            "updated_at": str(manifest.get("updated_at", "")),
        }
    except (FileNotFoundError, ValueError, KeyError):
        return {"logo_url": "", "version": 0, "updated_at": ""}


def reset_branding(base_dir: Path = BASE_DIR) -> dict:
    base_dir.mkdir(parents=True, exist_ok=True)
    backup = base_dir / ".backup"
    if backup.is_dir():
        for p in backup.glob("*.png"):
            shutil.copy2(p, base_dir / p.name)
    else:
        for p in base_dir.glob("*.png"):
            p.unlink()
        _manifest_path(base_dir).unlink(missing_ok=True)
        return read_branding(base_dir)
    version = int(time.time()) + 1  # strictly newer than any save in the same second
    manifest = {"version": version, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "updated_by": "reset"}
    _manifest_path(base_dir).write_text(json.dumps(manifest))
    return read_branding(base_dir)
