# Admin Logo Upload + Multi-Platform Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only logo upload that auto-generates all platform assets and goes live instantly for all users.

**Architecture:** Pure `BrandingService` (Pillow, no DB/HTTP) inside the existing `admin` domain; thin REST router for the binary upload (`POST/DELETE /admin/branding/logo`, admin JWT); files served via `StaticFiles` at `/static/branding`; public GraphQL `branding` query exposes the live URL + cache-busting version; frontend `Layout` swaps the CSS monogram for the live logo and `AdminDashboard` gains a `BrandingSection` with preview + reset.

**Tech Stack:** Pillow (via `qrcode[pil]`, already installed), FastAPI `UploadFile` + `StaticFiles` (`python-multipart` already installed), Strawberry GraphQL, React + Apollo, MUI.

## Global Constraints

- Money stays in `_cents` BigInteger columns — not touched by this plan.
- Every financial mutation notifies both parties — not touched; branding emits no notifications.
- Services call `session.commit()` explicitly — branding uses no DB session at all (filesystem + manifest only).
- GraphQL resolvers use try/finally with `service.session.close()` — the branding resolver holds no session, so no close needed (state why in a comment).
- `require_admin` semantics (`"admin" not in scopes` → reject) must be mirrored in the REST dependency — never trust `AdminRoute` UI gating alone.
- Pillow re-encode on every upload (strips EXIF, neutralizes embedded payloads); fixed output filenames (ignore client filename; no path traversal).
- Frontend is Strict TypeScript (`noUnusedLocals`, `noUnusedParameters` enforced) — no unused imports.
- `vite preview` proxies `/api/*` → backend with the prefix stripped, so the frontend must call `/api/admin/branding/logo` and use logo URLs starting with `/api/static/branding/`.
- Backend runs under PM2 without hot-reload: deploy code with `pm2 restart ccash-backend`; frontend serves `dist/`: deploy with `cd frontend && npm run build && pm2 restart ccash-frontend`.

---

## File Structure

- Create `backend/app/domains/admin/branding_service.py` — pure image logic: validate bytes, center-crop square, generate 6 variants, atomic save + `manifest.json`, read, reset. All functions take `base_dir: Path` (default `BASE_DIR`) so tests use `tmp_path`.
- Create `backend/app/api/branding.py` — REST router (`POST /logo`, `DELETE /logo`) with `require_admin_token` dependency (Bearer JWT → `decode_token` → `"admin"` scope check).
- Modify `backend/app/main.py` — mount `StaticFiles` at `/static/branding`, include branding router at `/admin/branding`.
- Modify `backend/app/domains/admin/graphql.py` — add `BrandingType` + public `branding` field on `AdminQueries`.
- Create `backend/tests/test_branding.py` — service unit tests (Pillow only, no DB) + router tests via `TestClient` on a standalone app + GraphQL resolver tests.
- Create `frontend/src/graphql/queries/branding.ts` — `GET_BRANDING` query.
- Modify `frontend/src/components/Layout.tsx` — render live logo `<img>` when `branding.logoUrl` present, CSS "C" fallback otherwise.
- Create `frontend/src/components/BrandingSection.tsx` — admin upload UI: file picker, preview grid, Upload + Reset buttons, snackbars.
- Modify `frontend/src/pages/AdminDashboard.tsx` — render `BrandingSection` above Members.

---

### Task 1: BrandingService (pure logic, TDD)

**Files:**
- Create: `backend/app/domains/admin/branding_service.py`
- Test: `backend/tests/test_branding.py` (service part; router/resolver tests added in Tasks 2–3)

**Interfaces:**
- Consumes: nothing (stdlib + Pillow only).
- Produces (used by Tasks 2–3):
  - `class BrandingError(Exception)` with `.code: str` (`"unsupported_type" | "too_large" | "corrupt_image"`).
  - `validate_upload(content: bytes, content_type: str | None, filename: str) -> str` — returns canonical extension (`".png" | ".jpg" | ".webp"`), raises `BrandingError`.
  - `load_square_image(content: bytes) -> Image.Image` — verifies, re-opens, center-crops to square, returns RGBA image.
  - `generate_variants(img: Image.Image) -> dict[str, Image.Image]` — keys: `logo-header.png` (256×256), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (410px art centered on 512 white canvas), `apple-touch-icon.png` (180×180), `favicon-64.png` (64×64).
  - `save_branding(variants: dict[str, Image.Image], actor_id: str, base_dir: Path = BASE_DIR) -> dict` — atomic write (temp dir + rename), backs up previous set to `.backup/` on first upload, writes `manifest.json`, returns `{"logo_url": ..., "version": int}`.
  - `read_branding(base_dir: Path = BASE_DIR) -> dict` — returns `{"logo_url": str, "version": int, "updated_at": str}`; defaults `{"logo_url": "", "version": 0, "updated_at": ""}` when no manifest.
  - `reset_branding(base_dir: Path = BASE_DIR) -> dict` — restores `.backup/` (or deletes generated set if no backup), bumps version, returns same shape as `read_branding`.
  - `BASE_DIR: Path` = `backend/static/branding/` resolved from `__file__` (four parents up from `backend/app/domains/admin/`).

- [ ] **Step 1: Write the failing tests (service part)**

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_branding.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.domains.admin.branding_service'`

- [ ] **Step 3: Write minimal implementation**

```python
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
    version = int(time.time()) + 1  # strictly newer than any save in the same second
    manifest = {"version": version, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "updated_by": "reset"}
    _manifest_path(base_dir).write_text(json.dumps(manifest))
    return read_branding(base_dir)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_branding.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/domains/admin/branding_service.py backend/tests/test_branding.py
git commit -m "feat: add branding service for admin logo assets"
```

---

### Task 2: REST upload router + static serving (TDD)

**Files:**
- Create: `backend/app/api/branding.py`
- Create: `backend/app/api/__init__.py` (empty, marks the package)
- Modify: `backend/app/main.py` (mount static dir + include router)
- Test: append router tests to `backend/tests/test_branding.py`

**Interfaces:**
- Consumes: `validate_upload`, `load_square_image`, `generate_variants`, `save_branding`, `reset_branding` from Task 1; `decode_token` from `app.core.security` (signature: `decode_token(token: str) -> dict` with `sub` + `scopes`).
- Produces (used by Task 4): `POST /admin/branding/logo` (multipart `file`, → `200 {"logo_url", "version"}`); `DELETE /admin/branding/logo` (→ `200 read_branding()`); errors: `401` no/invalid token, `403` non-admin, `400 {"code": ...}` validation failures. Static files at `/static/branding/*`.

- [ ] **Step 1: Write the failing router tests** (append to `backend/tests/test_branding.py`)

```python
def _branding_test_app(tmp_path, monkeypatch):
    import app.domains.admin.branding_service as bs

    monkeypatch.setattr(bs, "BASE_DIR", tmp_path)
    import app.api.branding as branding_api

    monkeypatch.setattr(branding_api, "BASE_DIR", tmp_path)
    from fastapi import FastAPI

    test_app = FastAPI()
    test_app.include_router(branding_api.router, prefix="/admin/branding")
    return test_app


def _token(scopes):
    from app.core.security import create_access_token

    return create_access_token(str(uuid.uuid4()), scopes=scopes)


def test_upload_requires_admin(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    test_app = _branding_test_app(tmp_path, monkeypatch)
    client = TestClient(test_app, raise_server_exceptions=False)

    assert client.post("/admin/branding/logo").status_code == 401
    user_token = _token(["wallet:read", "wallet:write"])
    res = client.post(
        "/admin/branding/logo",
        headers={"Authorization": f"Bearer {user_token}"},
        files={"file": ("logo.png", make_png(), "image/png")},
    )
    assert res.status_code == 403


def test_upload_roundtrip_and_reset(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    test_app = _branding_test_app(tmp_path, monkeypatch)
    client = TestClient(test_app, raise_server_exceptions=False)
    admin_token = _token(["wallet:read", "wallet:write", "admin"])
    headers = {"Authorization": f"Bearer {admin_token}"}

    res = client.post(
        "/admin/branding/logo",
        headers=headers,
        files={"file": ("logo.png", make_png(), "image/png")},
    )
    assert res.status_code == 200
    assert res.json()["logo_url"].startswith("/api/static/branding/logo-header.png?v=")
    assert (tmp_path / "icon-512.png").exists()

    bad = client.post(
        "/admin/branding/logo", headers=headers, files={"file": ("x.gif", b"GIF89a", "image/gif")}
    )
    assert bad.status_code == 400
    assert bad.json()["detail"]["code"] == "unsupported_type"

    reset = client.delete("/admin/branding/logo", headers=headers)
    assert reset.status_code == 200
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_branding.py::test_upload_requires_admin -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.api.branding'`

- [ ] **Step 3: Write minimal implementation**

`backend/app/api/__init__.py`: empty file.

`backend/app/api/branding.py`:

```python
"""Admin-only branding upload endpoints (binary REST, not GraphQL).

Rationale: a 5MB logo as GraphQL base64 would bloat ~33%; FastAPI UploadFile
streams to disk via python-multipart. Auth mirrors require_admin semantics.
"""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.core.security import decode_token
from app.domains.admin.branding_service import (
    BASE_DIR,
    BrandingError,
    generate_variants,
    load_square_image,
    read_branding,
    reset_branding,
    save_branding,
    validate_upload,
)

router = APIRouter()


async def require_admin_token(request: Request) -> uuid.UUID:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(auth[7:])
        user_id = uuid.UUID(payload.get("sub"))
        scopes = payload.get("scopes", [])
    except Exception:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if "admin" not in scopes:
        raise HTTPException(status_code=403, detail="Not authorized")
    return user_id


@router.post("/logo")
async def upload_logo(file: UploadFile = File(...), actor_id: uuid.UUID = Depends(require_admin_token)):
    content = await file.read()
    try:
        validate_upload(content, file.content_type, file.filename or "")
        img = load_square_image(content)
        variants = generate_variants(img)
    except BrandingError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": str(e)})
    return save_branding(variants, actor_id=str(actor_id), base_dir=BASE_DIR)


@router.delete("/logo")
async def reset_logo(actor_id: uuid.UUID = Depends(require_admin_token)):
    _ = actor_id
    return reset_branding(base_dir=BASE_DIR)
```

Wait — the test asserts `bad.json()["code"]`, but `HTTPException` renders `{"detail": ...}`. Fix: use a small exception handler instead of headers hack. Replace the `except BrandingError` block with a dedicated handler registered on the router... Actually `HTTPException` body shape is fixed. Simplest correct approach: return codes via a custom handler in the router module:

```python
from fastapi.responses import JSONResponse

@router.post("/logo")
async def upload_logo(...):
    content = await file.read()
    try:
        validate_upload(...)
        ...
    except BrandingError as e:
        return JSONResponse(status_code=400, content={"code": e.code, "message": str(e)})
```

Hmm, returning JSONResponse from a route works but status code handling in tests is fine. But mixing return types is ugly. Cleaner: raise `HTTPException(status_code=400, detail={"code": e.code, "message": str(e)})` — FastAPI renders `{"detail": {"code": ...}}`, so test would need `bad.json()["detail"]["code"]`. Decide: use `detail={"code": ...}` dict and update the test assertion to `bad.json()["detail"]["code"] == "unsupported_type"`. That is the FastAPI-idiomatic shape. I'll write the plan with this consistent version (fix both code and test now, so no inconsistency).

Final router code for the plan:

```python
    except BrandingError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": str(e)})
```

And test asserts `bad.json()["detail"]["code"] == "unsupported_type"`. (Correcting the Step 1 snippet accordingly — I must ensure the written plan file has the corrected assertion, not the wrong one.)

`backend/app/main.py` changes (surgical, append after the graphql router include at line 48):

```python
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from app.api.branding import router as branding_router
```

and after `app.include_router(graphql_router, prefix="/graphql")`:

```python
BRANDING_DIR = Path(__file__).resolve().parent.parent / "static" / "branding"
BRANDING_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static/branding", StaticFiles(directory=str(BRANDING_DIR)), name="branding")
app.include_router(branding_router, prefix="/admin/branding")
```

Note: `Path(__file__).resolve().parent.parent` from `backend/app/main.py` = `backend/`, so dir = `backend/static/branding/` — same directory the service resolves. State this invariant in a comment.

- [ ] **Step 4: Run tests**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_branding.py -v`
Expected: all PASS (5 service + 2 router)

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/branding.py backend/app/api/__init__.py backend/app/main.py backend/tests/test_branding.py
git commit -m "feat: add admin-only branding upload endpoints"
```

---

### Task 3: Public GraphQL `branding` query (TDD)

**Files:**
- Modify: `backend/app/domains/admin/graphql.py` (add `BrandingType` + `branding` field on `AdminQueries`; no import of session needed)
- Test: append resolver tests to `backend/tests/test_branding.py`

**Interfaces:**
- Consumes: `read_branding` from Task 1.
- Produces (used by Task 4): `query Branding { branding { logoUrl version updatedAt } }` — public (no `require_admin`), defaults `logoUrl: ""`, `version: 0` when never uploaded.

- [ ] **Step 1: Write the failing test**

```python
async def test_branding_query_reads_manifest(tmp_path, monkeypatch):
    import app.domains.admin.branding_service as bs
    import app.domains.admin.graphql as admin_gql

    monkeypatch.setattr(bs, "BASE_DIR", tmp_path)
    monkeypatch.setattr(admin_gql, "BASE_DIR", tmp_path)

    from strawberry.types import Info

    class FakeInfo:
        context = None

    empty = await admin_gql.AdminQueries().branding(FakeInfo())  # type: ignore
    assert empty.logo_url == "" and empty.version == 0

    img = load_square_image(make_png())
    save_branding(generate_variants(img), actor_id="a1", base_dir=tmp_path)
    full = await admin_gql.AdminQueries().branding(FakeInfo())  # type: ignore
    assert full.logo_url.startswith("/api/static/branding/logo-header.png?v=")
    assert full.version > 0
```

Note: this requires `graphql.py` to import `BASE_DIR`/`read_branding` from the service at module level (`from app.domains.admin.branding_service import BASE_DIR, read_branding`) so monkeypatching `admin_gql.BASE_DIR` works. The resolver:

```python
@strawberry.type
class BrandingType:
    logo_url: str
    version: int
    updated_at: str


# inside AdminQueries:
@strawberry.field
async def branding(self, info: Info) -> BrandingType:
    # Public read: every client needs the logo URL. No session held, so no
    # session.close() needed (unlike the DB-backed fields above).
    data = read_branding(base_dir=BASE_DIR)
    return BrandingType(**data)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_branding.py::test_branding_query_reads_manifest -v`
Expected: FAIL with `AttributeError` (no `branding` field / no `BASE_DIR` in graphql module)

- [ ] **Step 3: Write minimal implementation** — add the import, `BrandingType`, and `branding` field exactly as above. No change to `schema.py` needed (root `Query` already inherits `AdminQueries`).

- [ ] **Step 4: Run full backend suite**

Run: `cd backend && ./.venv/bin/python -m pytest`
Expected: all PASS (existing 51+ tests plus the 8 new branding tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/domains/admin/graphql.py backend/tests/test_branding.py
git commit -m "feat: expose public branding query for live logo"
```

---

### Task 4: Frontend live logo (Layout + query)

**Files:**
- Create: `frontend/src/graphql/queries/branding.ts`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `branding { logoUrl version updatedAt }` from Task 3.
- Produces (used by Task 5): live logo in drawer header + mobile AppBar; `GET_BRANDING` reused by `BrandingSection`.

- [ ] **Step 1: Create the query + wire Layout**

`frontend/src/graphql/queries/branding.ts`:

```ts
import { gql } from "@apollo/client";

export const GET_BRANDING = gql`
  query Branding {
    branding {
      logoUrl
      version
      updatedAt
    }
  }
`;

export interface BrandingData {
  branding: {
    logoUrl: string;
    version: number;
    updatedAt: string;
  };
}
```

`Layout.tsx` changes (surgical — only the drawer logo box and imports):
1. Add imports: `import { GET_BRANDING, type BrandingData } from "../graphql/queries/branding";` (alongside the existing `UNREAD_COUNT` import, line 36).
2. Inside the component (after line 68 `const unreadCount = ...`), add:
```tsx
const { data: brandingData } = useQuery<BrandingData>(GET_BRANDING);
const logoUrl = brandingData?.branding?.logoUrl || "";
```
3. Replace the hardcoded monogram box (lines 85–101) content: keep the styled `Box`, but render `{logoUrl ? <img src={logoUrl} alt="CCash logo" style={{ width: 24, height: 24, objectFit: "contain" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : "C"}` instead of `C`. The `onError` fallback preserves the "C" if the file is missing.

- [ ] **Step 2: Verify with typecheck + build**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

Run: `cd frontend && npm run build`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/graphql/queries/branding.ts frontend/src/components/Layout.tsx
git commit -m "feat: render live branding logo in layout"
```

---

### Task 5: Admin BrandingSection UI + end-to-end verify

**Files:**
- Create: `frontend/src/components/BrandingSection.tsx`
- Modify: `frontend/src/pages/AdminDashboard.tsx` (render section)
- Test: manual verify (no new automated tests — upload path already covered in Tasks 2–3)

**Interfaces:**
- Consumes: `GET_BRANDING`/`BrandingData` from Task 4; `POST /api/admin/branding/logo`, `DELETE /api/admin/branding/logo` from Task 2; Bearer token from `localStorage.getItem("accessToken")` (same source as `graphql/client.ts`).

- [ ] **Step 1: Create BrandingSection**

```tsx
import { useRef, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Snackbar, Typography } from "@mui/material";
import { useQuery } from "@apollo/client";
import { GET_BRANDING, type BrandingData } from "../graphql/queries/branding";

const UPLOAD_URL = "/api/admin/branding/logo";
const MAX_BYTES = 5 * 1024 * 1024;

export default function BrandingSection() {
  const { data, refetch } = useQuery<BrandingData>(GET_BRANDING);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setSnackbar({ open: true, message: "Only PNG, JPG or WebP images are accepted", severity: "error" });
      return;
    }
    if (f.size > MAX_BYTES) {
      setSnackbar({ open: true, message: "Image must be 5MB or smaller", severity: "error" });
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail?.message ?? body?.detail ?? "Upload failed");
      }
      setFile(null);
      setPreview(null);
      await refetch();
      setSnackbar({ open: true, message: "Logo updated for all platforms", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : "Upload failed", severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const res = await fetch(UPLOAD_URL, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` },
      });
      if (!res.ok) throw new Error("Reset failed");
      await refetch();
      setSnackbar({ open: true, message: "Logo restored to default", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : "Reset failed", severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" fontWeight="bold" mb={1}>Branding</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Upload a logo to regenerate all platform assets (app header, PWA icons, touch icon, favicon). PNG, JPG or WebP up to 5MB — square-cropped automatically.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button variant="outlined" onClick={() => inputRef.current?.click()} disabled={busy}>
            Choose file
          </Button>
          <Button variant="contained" onClick={upload} disabled={!file || busy}>
            {busy ? "Working…" : "Upload logo"}
          </Button>
          <Button variant="text" color="secondary" onClick={reset} disabled={busy}>
            Reset to default
          </Button>
        </Box>
        {(preview || data?.branding?.logoUrl) && (
          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end", flexWrap: "wrap" }}>
            {[96, 48, 24].map((size) => (
              <Box key={size} sx={{ textAlign: "center" }}>
                <img
                  src={preview ?? data!.branding.logoUrl}
                  alt={`Logo preview ${size}px`}
                  width={size}
                  height={size}
                  style={{ objectFit: "contain", borderRadius: 8, border: "1px solid", borderColor: "divider" }}
                />
                <Typography variant="caption" display="block">{size}px</Typography>
              </Box>
            ))}
          </Box>
        )}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">
            {snackbar.message}
          </Alert>
        </Snackbar>
      </CardContent>
    </Card>
  );
}
```

`AdminDashboard.tsx` changes (surgical): add `import BrandingSection from "../components/BrandingSection";` (after line 31 `formatMoney` import) and render `<BrandingSection />` directly after `<Typography variant="h5" ...>Admin Dashboard</Typography>` (line 178).

- [ ] **Step 2: Typecheck + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no type errors, build succeeds

- [ ] **Step 3: Full backend suite + deploy + manual verify**

Run: `cd backend && ./.venv/bin/python -m pytest`
Expected: all PASS

Deploy (per AGENTS.md — backend has no hot-reload, frontend serves `dist/`):
```bash
pm2 restart ccash-backend
cd frontend && npm run build && pm2 restart ccash-frontend
```

Manual verify:
1. Seed if needed: `cd backend && ./.venv/bin/python -m app.seed`
2. Log in as `admin@ccash.ph` → `/admin` → Branding → upload a non-square JPG → preview grid shows 96/48/24px → Upload → success snackbar, header logo changes.
3. Open `/api/static/branding/icon-512.png`, `icon-192.png`, `apple-touch-icon.png` directly — all load at exact sizes.
4. Second browser session as `alice@ccash.ph` — header shows the new logo (instant, no rebuild).
5. As Alice, `curl -X POST /api/admin/branding/logo` with her token → `403`; without token → `401`.
6. As admin: Reset to default → logo falls back, version bumped.
7. `./backend/.venv/bin/python scripts/verify_realtime.py` still passes (websocket fan-out untouched).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BrandingSection.tsx frontend/src/pages/AdminDashboard.tsx
git commit -m "feat: add admin branding upload section"
```

---

## Self-Review

1. **Spec coverage:** PWA+header set → Task 1 `SIZES`/maskable; instant rollout → Tasks 2–4 static+query; 5MB PNG/JPG/WebP auto-crop → Tasks 1+5 validation; admin-only → Task 2 `require_admin_token` + Task 5 behind existing `AdminRoute`; preview+revert → Task 5; atomic writes + error codes → Tasks 1–2; tests → Tasks 1–3 + manual Task 5; rollout → Task 5 deploy block. No gaps.
2. **Placeholder scan:** no TBD/TODO; every code step shows complete code; error handling is explicit (`BrandingError` codes, HTTP shapes, snackbar paths); no "similar to Task N" references.
3. **Type consistency:** `logo_url/version/updated_at` snake_case in Python service, resolver, and tests; `logoUrl/version/updatedAt` camelCase in GraphQL schema, `BrandingData`, and components. Router error shape `{"detail": {"code", "message"}}` matches the `BrandingSection` parser (`body?.detail?.message`). `BASE_DIR` import-and-monkeypatch pattern is identical in Tasks 2–3. Logo URL prefix `/api/static/branding/` is the same literal in service, tests, and Task 5 manual checks.
