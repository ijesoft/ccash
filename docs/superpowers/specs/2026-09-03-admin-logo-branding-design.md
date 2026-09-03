# Admin Logo Upload + Multi-Platform Assets — Design

Date: 2026-09-03 | Status: approved | Author: OpenCode (with user)

## 1. Goal
Admin-only upload that replaces the CCash logo and auto-generates all
platform assets, live instantly for all users with no frontend rebuild.

Non-goals: full theme editor, per-user logos, login/QR/receipt rebranding
(header + PWA set only), CDN deployment.

## 2. Decisions (from brainstorming)
- Asset set: PWA + header logo (icon-192, icon-512, icon-maskable-512,
  apple-touch-icon 180px, favicon-64, logo-header).
- Rollout: instant, no rebuild — backend stores + serves, frontend reads
  live URL via GraphQL.
- Validation: PNG/JPG/WebP, ≤5MB, center-crop to square.
- UI: "Branding" section in AdminDashboard with preview grid + reset.
- Transport (approach A): REST `UploadFile` (python-multipart + Pillow
  already installed) instead of GraphQL base64 (+33% bloat) or
  on-demand resizing (first-load latency).

## 3. Architecture
New `branding` concern inside the existing `admin` domain (follows
`service.py` + `graphql.py` per-domain pattern; no new DDD domain).

- `backend/app/domains/admin/branding_service.py` — validate, process,
  persist, manifest. Pure logic, unit-testable without HTTP.
- `backend/app/api/branding.py` — REST router: `POST /admin/branding/logo`,
  `DELETE /admin/branding/logo`. Admin JWT via existing `decode_token` +
  `require_admin` semantics. Mounted in `main.py`.
- Static serving: `app.mount("/static/branding",
  StaticFiles(directory="backend/static/branding"))`. Vite preview proxies
  `/api/*` → backend, so frontend uses `/api/static/branding/<file>?v=<n>`.
- GraphQL: `branding: BrandingType { logoUrl, version, updatedAt }` on
  `AdminQueries` (public read — every client needs it; upload stays
  admin-only). Added to root `Query` via existing multiple inheritance.
- Disk layout: `backend/static/branding/{logo-header.png, icon-192.png,
  icon-512.png, icon-maskable-512.png, apple-touch-icon.png, favicon-64.png,
  manifest.json, .backup/*}`. Manifest: `{version, updated_at, updated_by}`.
  `logoUrl` = `/api/static/branding/logo-header.png?v=<version>`.

## 4. Components
Backend `BrandingService`:
- `validate(content, filename)` — extension + MIME allowlist
  (png/jpg/webp), size ≤5MB, `PIL.Image.verify()` then re-open (catches
  corrupt/polyglot files), convert RGBA→RGB flattened on white for JPEG
  sources, keep alpha for PNG.
- `process(image)` — center-crop to square, LANCZOS resize to
  512/192/180/64; maskable-512 = 512 artwork centered on solid background
  with ~48px safe-zone padding; header logo = 256px-wide variant
  (max height 64, transparent preserved).
- `save(variants, actor)` — write to temp dir then atomic rename; first
  upload copies current files to `.backup/`; write `manifest.json` with
  bumped version (unix timestamp), actor id, updated_at.
- `reset()` — restore `.backup/`, bump version; if no backup, delete
  generated set (frontend falls back to CSS "C" + static defaults).

Frontend:
- `src/graphql/queries/branding.ts` — `GET_BRANDING` query.
- `Layout.tsx` — query branding; replace CSS "C" box with `<img
  src={logoUrl}>` when present, `onError` fallback to "C". Same for AppBar
  on mobile (text title unchanged).
- `AdminDashboard.tsx` + `components/BrandingSection.tsx` — file input
  (accept png/jpg/webp), client preview (object URLs at each display size),
  Upload (Bearer token POST), Reset (DELETE), snackbar feedback,
  refetch `GET_BRANDING`. Route stays behind existing `AdminRoute`.

## 5. Data flow
1. Admin picks file → instant client-side preview grid.
2. Upload → `POST /api/admin/branding/logo` (Bearer admin JWT).
3. Backend validates → generates 6 variants → atomic write + manifest bump
   → responds `{logoUrl, version}`.
4. Frontend refetches `GET_BRANDING`; all clients poll/cache-bust via `?v=`.
5. Reset → `DELETE /api/admin/branding/logo` → restore backup → bump
   version → refetch.

## 6. Error handling
- 401 missing/invalid token; 403 non-admin (both REST endpoints).
- 400 with explicit codes: `unsupported_type`, `too_large`, `corrupt_image`.
- Atomic writes: failure leaves previous set untouched; temp dir cleaned up.
- Frontend: error snackbars, Upload disabled while pending, old logo kept
  on failure, `<img onError>` fallback to CSS monogram.
- Rate-limit via existing `RateLimitMiddleware`; 5MB cap enforced before
  full read (spill to disk via `UploadFile`).

## 7. Security
- Admin-only enforced server-side on both REST endpoints (never trust
  `AdminRoute` UI gating alone).
- Pillow re-encode on every upload (strips EXIF/metadata, neutralizes
  embedded payloads); served with `image/png` content-type, no sniffing.
- Filename ignored for storage (fixed output names); no path traversal.
- Max 5MB + `UploadFile` spooling bounds memory.

## 8. Testing
- `backend/tests/test_branding.py`: valid PNG → all 6 files exist at exact
  pixel sizes; non-image → 400; oversize → 400; non-square → center-cropped
  square; manifest version bumps on upload + reset; non-admin → 403;
  failed upload leaves previous set intact.
- Manual verify: seed (`admin@ccash.ph`), upload via Admin UI, confirm
  `/api/static/branding/*` URLs load, confirm header logo updates in a
  second non-admin session (`alice@ccash.ph`), confirm reset restores.
- Existing suite must stay green: `cd backend && ./.venv/bin/python -m pytest`.

## 9. Rollout
1. Backend changes → `pm2 restart ccash-backend` (no hot-reload under PM2).
2. Frontend changes → `cd frontend && npm run build && pm2 restart
   ccash-frontend` (preview serves `dist/`).
3. Seed backup: first upload auto-backs-up current assets; no migration
   needed (disk + manifest, no schema change).
