# alex-0d18-test-18

React + Express monorepo for an image upload and gallery workflow.

## Workspace Layout

- `apps/web`: React frontend powered by Vite and Tailwind.
- `apps/api`: Express API server. In production it also serves the built web assets.
- `packages/shared`: shared TypeScript contracts.

## Local Development

Install dependencies:

```bash
npm install
```

Configure local environment:

```bash
cp .env.example .env
set -a
. ./.env
set +a
```

Run database migrations:

```bash
npm run db:migrate
```

Run the frontend and API together:

```bash
npm run dev
```

Useful validation commands:

```bash
npm run check
npm run test
npm run test:e2e
npm run build
```

## Required Environment

The server reads configuration from environment variables. It does not auto-load `.env` files, so use your shell, process manager, or systemd `EnvironmentFile`.

Required runtime variables:

- `DATABASE_URL`: PostgreSQL connection string.
- `HOST`: bind host. Use `0.0.0.0` for self-hosted deployment.
- `PORT`: bind port. Defaults to `8080`.
- `WEB_DIST_DIR`: optional path to the built React assets. Defaults to `apps/web/dist` when running from this repository.
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_PREFIX`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_FORCE_PATH_STYLE`
- `S3_PUBLIC_BASE_URL`

`S3_PREFIX` must end with `/`. The application stores relative object keys in PostgreSQL and prepends `S3_PREFIX` for every Object Storage operation.

## Self-Hosted Deployment

This deployment mode runs one Node.js process on port `8080`. Express serves `/api/*` and the static React build from the same process.

1. Install Node.js 20 or newer on the host.
2. Clone the repository and install dependencies:

```bash
npm ci
```

3. Create an environment file from `.env.example` and fill in PostgreSQL plus S3-compatible Object Storage values:

```bash
cp .env.example .env.production
```

4. Build the API, web app, and shared package:

```bash
npm run build
```

5. Load the production environment and run migrations:

```bash
set -a
. ./.env.production
set +a
npm run db:migrate
```

6. Start the production server:

```bash
npm start
```

The app listens on `http://0.0.0.0:8080` by default. Put a reverse proxy such as nginx, Caddy, or your platform load balancer in front of it for TLS. Use `/health` as the health check path.

Optional after building and migrating:

```bash
npm prune --omit=dev
```

Run `npm start` after pruning; do not run migrations after pruning because the migration command uses development tooling.

## systemd Example

Create `/etc/systemd/system/alex-0d18-test-18.service`:

```ini
[Unit]
Description=alex-0d18-test-18 image gallery
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/alex-0d18-test-18
EnvironmentFile=/opt/alex-0d18-test-18/.env.production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=alex-0d18-test-18
Group=alex-0d18-test-18

[Install]
WantedBy=multi-user.target
```

Then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now alex-0d18-test-18
sudo systemctl status alex-0d18-test-18
```
