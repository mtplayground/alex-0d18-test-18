# alex-0d18-test-18

React + Express monorepo for an image upload and gallery workflow.

## Workspace Layout

- `apps/web`: React frontend powered by Vite and Tailwind.
- `apps/api`: Express API server.
- `packages/shared`: shared TypeScript contracts.

## Scripts

Install dependencies:

```bash
npm install
```

Run database migrations:

```bash
export DATABASE_URL="postgres://..."
npm run db:migrate
```

Run the frontend and API together:

```bash
npm run dev
```

Build every workspace:

```bash
npm run build
```

The API listens on `0.0.0.0:8080` by default. Set `PORT` or `HOST` to override that locally. The API requires `DATABASE_URL` at startup and fails fast when it is not set.
