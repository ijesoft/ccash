"""Branding: admin logo upload generates multi-platform assets.

Covers docs/superpowers/specs/2026-09-03-admin-logo-branding-design.md.
Service tests are pure Pillow (no DB, no HTTP); router/resolver tests below
use tmp dirs + TestClient, never the real static folder.
"""

import io
import uuid

import pytest
from PIL import Image


def make_png(width: int = 800, height: int = 600, color=(15, 110, 205)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def test_validate_accepts_png_jpg_webp():
    from app.domains.admin.branding_service import validate_upload

    assert validate_upload(make_png(), "image/png", "logo.png") == ".png"
    buf = io.BytesIO()
    Image.new("RGB", (100, 100)).save(buf, format="JPEG")
    assert validate_upload(buf.getvalue(), "image/jpeg", "photo.jpg") == ".jpg"
    buf = io.BytesIO()
    Image.new("RGB", (100, 100)).save(buf, format="WEBP")
    assert validate_upload(buf.getvalue(), "image/webp", "logo.webp") == ".webp"


def test_validate_rejects_type_and_size():
    from app.domains.admin.branding_service import BrandingError, validate_upload

    with pytest.raises(BrandingError) as e:
        validate_upload(b"GIF89a...", "image/gif", "anim.gif")
    assert e.value.code == "unsupported_type"

    with pytest.raises(BrandingError) as e:
        validate_upload(b"x" * (5 * 1024 * 1024 + 1), "image/png", "big.png")
    assert e.value.code == "too_large"

    with pytest.raises(BrandingError) as e:
        validate_upload(b"not an image", "image/png", "fake.png")
    assert e.value.code == "corrupt_image"


def test_square_crop_and_variant_sizes(tmp_path):
    from app.domains.admin.branding_service import (
        generate_variants,
        load_square_image,
        save_branding,
    )

    img = load_square_image(make_png(800, 600))  # non-square in
    assert img.size[0] == img.size[1]  # square out

    variants = generate_variants(img)
    assert variants["icon-192.png"].size == (192, 192)
    assert variants["icon-512.png"].size == (512, 512)
    assert variants["icon-maskable-512.png"].size == (512, 512)
    assert variants["apple-touch-icon.png"].size == (180, 180)
    assert variants["favicon-64.png"].size == (64, 64)
    assert variants["logo-header.png"].size == (256, 256)

    out = save_branding(variants, actor_id=str(uuid.uuid4()), base_dir=tmp_path)
    assert out["version"] > 0
    assert out["logo_url"].startswith("/api/static/branding/logo-header.png?v=")
    for name in variants:
        assert (tmp_path / name).exists()
    assert (tmp_path / "manifest.json").exists()


def test_reset_restores_backup(tmp_path):
    from app.domains.admin.branding_service import (
        generate_variants,
        load_square_image,
        read_branding,
        reset_branding,
        save_branding,
    )

    (tmp_path / "icon-192.png").write_bytes(b"original")
    img = load_square_image(make_png())
    v1 = save_branding(generate_variants(img), actor_id="a1", base_dir=tmp_path)["version"]

    out = reset_branding(base_dir=tmp_path)
    assert (tmp_path / "icon-192.png").read_bytes() == b"original"
    assert out["version"] > v1
    assert read_branding(base_dir=tmp_path)["version"] == out["version"]


def test_read_defaults_when_no_manifest(tmp_path):
    from app.domains.admin.branding_service import read_branding

    assert read_branding(base_dir=tmp_path) == {"logo_url": "", "version": 0, "updated_at": ""}
