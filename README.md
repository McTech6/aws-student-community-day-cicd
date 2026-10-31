# Forge

Forge is a small internal tool for a (fake) studio. It tracks **people**,
**projects** and **tasks**. It is a full-stack TypeScript app: a React
frontend talks to a NestJS API, which stores data in PostgreSQL through
Prisma. Locally the database runs in Docker; in AWS it will be Amazon RDS.

**Status:** the **People** feature works end to end (list, add, remove).
Projects and Tasks exist in the database schema and seed data, but have no
API routes or UI yet.

---

## Architecture

```
Browser  →  apps/web   (React + Vite)        http://localhost:3000
               ↓  /api/* (Vite dev proxy)
            apps/api   (NestJS)              http://localhost:3001/api
               ↓  Prisma
            PostgreSQL (Docker, compose.yaml) localhost:5432
```

The web app always calls the relative path `/api`. Locally the Vite dev
server forwards it to the API; in AWS, CloudFront will do the same job.

## Tech stack

| Layer | Tools |
|-------|-------|
| Frontend | React 19, Vite 6, TypeScript |
| Backend | NestJS 11, class-validator, TypeScript |
| Database | PostgreSQL 17, Prisma 6 |
| Repo | npm workspaces (monorepo), Node 22 (`.nvmrc`) |

---

## Project structure

```
forge/
├── package.json              npm workspaces + run scripts
├── compose.yaml              Local PostgreSQL in Docker
├── .env.example              Env variables (copy to apps/api/.env)
├── .nvmrc                    Node version (22)
├── .gitignore                Ignores node_modules, dist, .env
├── apps/
│   ├── web/                  Frontend (React + Vite)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.tsx      Entry point
│   │       ├── App.tsx       Top bar + Home / People views
│   │       └── people/
│   │           ├── PeoplePage.tsx      Page layout, loading + error states
│   │           ├── PeopleList.tsx      The roster with Remove buttons
│   │           ├── PersonForm.tsx      Add-a-person form
│   │           ├── PeopleEmpty.tsx     Empty state
│   │           ├── usePeopleRoster.ts  Hook: load, add, remove
│   │           ├── peopleApi.ts        fetch calls to the API
│   │           └── types.ts            Frontend types
│   └── api/                  Backend (NestJS)
│       ├── Dockerfile                  Multi-stage image for ECS
│       ├── docker-entrypoint.sh        Migrate, then start the API
│       ├── prisma/
│       │   ├── schema.prisma           Person, Project, Task models
│       │   ├── migrations/             Generated SQL
│       │   └── seed.ts                 Sample data
│       └── src/
│           ├── main.ts                 Starts the server, CORS, validation
│           ├── app.module.ts           Root module
│           ├── health.controller.ts    GET /api/health
│           ├── prisma/                 Shared Prisma database client
│           └── people/
│               ├── people.controller.ts   HTTP routes
│               ├── people.service.ts      Logic + database calls
│               ├── dto/create-person.dto.ts  Input validation rules
│               ├── person.ts              API Person type
│               └── person.mapper.ts       DB row → API shape
└── packages/
    └── shared/               Types shared between web and api
```

### How a request flows

Adding a person:

1. `PersonForm` calls `addPerson` from the `usePeopleRoster` hook.
2. `peopleApi.ts` sends `POST /api/people` with JSON.
3. NestJS validates the body against `CreatePersonDto` (400 if invalid).
4. `PeopleService` trims and lowercases the email and saves it with Prisma.
5. A duplicate email hits the database `UNIQUE` index and becomes a 409.
6. On success the new person is added to the list on screen.

---

## Getting started

### Requirements

- Node.js 22 (see `.nvmrc`; `nvm use` picks it up)
- Docker with Docker Compose (for the local database)

### 1. Install

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example apps/api/.env
```

The defaults work as they are with the local Docker database:

| Name | Where | Purpose |
|------|-------|---------|
| `DATABASE_URL` | `apps/api/.env` | Postgres connection string. Defaults to the local Docker database. |
| `CORS_ORIGINS` | `apps/api/.env` | Optional. Comma-separated origins allowed to call the API directly. Defaults to `http://localhost:3000`. |
| `PORT` | `apps/api/.env` | Optional. API port. Defaults to `3001`. |
| `VITE_API_URL` | `apps/web/.env` | Optional. API base URL for the web app. Defaults to `/api` (same origin). |

`.env` files are gitignored. Never commit real connection strings.

### 3. Start and set up the database

```bash
docker compose up -d          # PostgreSQL on localhost:5432
cd apps/api
npx prisma migrate deploy     # create the tables
npx prisma db seed            # sample data
cd ../..
```

The seed adds three people, one project and one task. Running it twice does
not create duplicates. Stop the database with `docker compose down`; add `-v`
to also delete its data.

### 4. Run

Use two terminals, both from the project root:

```bash
npm run dev:api   # http://localhost:3001/api
```

```bash
npm run dev:web   # http://localhost:3000
```

Check http://localhost:3001/api/health returns `{"ok":true,...}`, then open
http://localhost:3000.

### Run the API in Docker

This is the same image that runs in AWS (ECS Fargate). Build it from the
repo root:

```bash
docker build -f apps/api/Dockerfile -t forge-api .
docker run --rm --network host \
  -e DATABASE_URL="postgresql://forge:forge@localhost:5432/forge" forge-api
```

On start the container runs `prisma migrate deploy`, then starts the API as
the non-root `node` user. Instead of `DATABASE_URL` it also accepts
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` and `DB_SSLMODE`
(default `require`), which is how ECS passes the RDS secret.

### Scripts

| Command (from root) | What it does |
|---------------------|--------------|
| `npm run dev:web` | Start the frontend in dev mode |
| `npm run dev:api` | Start the API in watch mode |
| `npm run build:web` | Build the frontend to `apps/web/dist` |
| `npm run build:api` | Build the API to `apps/api/dist` |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run typecheck` | TypeScript checks for both apps |
| `npm test` | Unit tests (Vitest) for both apps |
| `npm run ci` | Everything the pipeline runs: lint, typecheck, test, audit, build |

---

## API

| Method | Path | Success | Errors |
|--------|------|---------|--------|
All routes are under `/api`.

| Method | Path | Success | Errors |
|--------|------|---------|--------|
| GET | `/api/health` | 200 | |
| GET | `/api/people` | 200, list of people | |
| POST | `/api/people` | 201, the new person | 400 invalid body, 409 duplicate email |
| DELETE | `/api/people/:id` | 204, no body | 404 unknown id |

**Validation rules for `POST /api/people`:**

- `name`: 2–80 characters
- `email`: valid email, stored trimmed and lowercased (`ADA@forge.test` is
  the same as `ada@forge.test`)
- `role`: optional, `intern` or `core`, defaults to `intern`

Example:

```bash
curl -s -X POST http://localhost:3001/api/people \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@forge.test"}'
```

Browsers normally reach the API through the same origin (`/api`), so CORS
doesn't come into play. For direct cross-origin calls, the API only allows
the origins in `CORS_ORIGINS` (see `apps/api/src/main.ts`).

---

## Database

Defined in `apps/api/prisma/schema.prisma`:

| Model | Fields |
|-------|--------|
| **Person** | `id`, `name`, `email` (unique), `role` (`INTERN` / `CORE`), `createdAt` |
| **Project** | `id`, `name`, `status` (`IDEA` / `ACTIVE` / `DONE`), `createdAt` |
| **Task** | `id`, `title`, `status` (`TODO` / `DOING` / `DONE`), optional `projectId`, optional `assigneeId`, `createdAt` |

A task can belong to one project and be assigned to one person. Deleting a
person keeps their tasks but clears the assignee (`ON DELETE SET NULL`).

Use fake data only, e.g. `someone@forge.test`.

---

## Roadmap

- [x] People: list, add, remove (web → API → database)
- [ ] Projects API + UI
- [ ] Tasks API + UI
- [ ] Use `packages/shared` types in both apps
- [ ] CI/CD on AWS (CodeBuild, CodePipeline, ECS Fargate, RDS, S3 + CloudFront, all as CDK code)
