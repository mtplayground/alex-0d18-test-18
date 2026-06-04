# alex-0d18-test-18 Product Contract

## What It Is

`alex-0d18-test-18` is a self-hostable image upload and gallery application. It lets users upload multiple images, browse them in a responsive gallery, select images, and download the selected set as a zip file.

## Current Features

- Multi-file image upload with drag-and-drop and file picker support.
- Client and server validation for supported image types, empty files, and upload size limits.
- Per-file upload progress, success, and failure feedback.
- PostgreSQL-backed image metadata persistence.
- S3-compatible Object Storage for image bytes.
- Paginated image list API and responsive gallery grid.
- Lazy image loading and infinite scroll for large galleries.
- Same-origin image serving route for gallery display.
- Gallery multi-select with select-all and clear actions.
- Download selected images as an on-demand zip archive.
- Backend unit tests for upload, list, and zip behavior.
- Backend unit tests for Object Storage wrapper prefix isolation and put/get/delete behavior.
- Backend tests for zip/download failure paths, including storage read failures, missing objects, empty selections, and partial selections.
- Playwright E2E test covering upload -> display -> select -> zip download, including image load and zip contents.
- Self-hosted deployment path with one Express process serving both `/api/*` and the built React app.

## Architecture

- Monorepo using npm workspaces.
- `apps/web`: React, Vite, Tailwind frontend.
- `apps/api`: Express API server in TypeScript.
- `packages/shared`: shared TypeScript contracts.
- Backend route modules delegate business logic to service modules and PostgreSQL access to repository modules.
- Upload, list, image-content, and zip download behavior is split into focused modules for validation, streaming, metadata lookup, and zip response assembly.
- Object Storage access is centralized behind `ObjectStorageClient`; feature code does not call S3 SDK commands directly.
- Frontend gallery pagination, selection, and download state live in dedicated hooks.
- Frontend upload queue state, progress, retry, validation messages, and preview cleanup live in a dedicated hook.
- Frontend API helpers share common response parsing and error-message extraction.
- Production server listens on `0.0.0.0:8080` by default and serves `apps/web/dist` unless `WEB_DIST_DIR` overrides it.
- API routes:
  - `POST /api/images` uploads images.
  - `GET /api/images` lists images with cursor pagination.
  - `GET /api/images/:imageId/content` streams an image for gallery display.
  - `POST /api/downloads/zip` streams selected images as a zip.
  - `GET /health` returns service health.

## Data And Storage Decisions

- PostgreSQL is the only persistent metadata store.
- The `images` table stores filename, relative storage key, content type, size, dimensions, and upload timestamp.
- User-uploaded bytes are stored only in S3-compatible Object Storage.
- The app uses the `S3_*` environment variable scheme.
- `S3_PREFIX` is mandatory and must end with `/`.
- Storage keys saved in PostgreSQL are relative keys; every S3 `PutObject`, `GetObject`, and `DeleteObject` call prepends `S3_PREFIX`.
- Gallery image URLs are same-origin API URLs; the API reads image bytes from Object Storage instead of exposing raw storage URLs to the browser.
- No SQLite, JSON-file persistence, local upload directories, base64-in-Postgres storage, or ephemeral volume storage are part of the product.

## Runtime Configuration

Required environment variables:

- `DATABASE_URL`
- `HOST`
- `PORT`
- `WEB_DIST_DIR` optional, defaults to `apps/web/dist`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_PREFIX`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_FORCE_PATH_STYLE`
- `S3_PUBLIC_BASE_URL`

The server fails fast when required database or object-storage configuration is missing.

## Operational Commands

- `npm run dev`: run API and frontend dev servers.
- `npm run db:migrate`: run PostgreSQL migrations.
- `npm run check`: typecheck, lint, and formatting check.
- `npm run test`: backend unit tests.
- `npm run test:e2e`: Playwright E2E flow.
- `npm run build`: build all workspaces.
- `npm start`: run the production Express server.

## Deployment Convention

For bare self-hosted deployment: install dependencies, build, load environment variables, run migrations, then run `npm start`. Put a reverse proxy in front for TLS and use `/health` for health checks.
