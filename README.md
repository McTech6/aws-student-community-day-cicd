# Forge

Forge is a small internal tool for a (fake) studio. It tracks **people**,
**projects** and **tasks**. It is a full-stack TypeScript app: a React
frontend talks to a NestJS API, which stores data in Postgres (Neon) through
Prisma.

**Status:** the **People** feature works end to end (list, add, remove).
Projects and Tasks exist in the database schema and seed data, but have no
API routes or UI yet.

---

## Architecture

```
Browser  →  apps/web   (React + Vite)        http://localhost:3000
               ↓  HTTP JSON
            apps/api   (NestJS)              http://localhost:3001
               ↓  Prisma
            Neon       (Postgres)
```

## Tech stack

| Layer | Tools |
|-------|-------|
| Frontend | React 19, Vite 6, TypeScript |
| Backend | NestJS 10, class-validator, TypeScript |
| Database | PostgreSQL on Neon, Prisma 6 |
| Repo | npm workspaces (monorepo) |

---

## Project structure

```
forge/
├── package.json              npm workspaces + run scripts
├── .env.example              Env variable names (copy to apps/api/.env)
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
│       ├── prisma/
│       │   ├── schema.prisma           Person, Project, Task models
│       │   ├── migrations/             Generated SQL
│       │   └── seed.ts                 Sample data
│       └── src/
│           ├── main.ts                 Starts the server, CORS, validation
│           ├── app.module.ts           Root module
│           ├── health.controller.ts    GET /health
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
2. `peopleApi.ts` sends `POST /people` with JSON.
3. NestJS validates the body against `CreatePersonDto` (400 if invalid).
4. `PeopleService` trims and lowercases the email and saves it with Prisma.
5. A duplicate email hits the database `UNIQUE` index and becomes a 409.
6. On success the new person is added to the list on screen.

---

## Getting started

### Requirements

- Node.js 20 or newer
- A Neon (Postgres) database

### 1. Install

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example apps/api/.env
```

Fill in your Neon connection strings in `apps/api/.env`:

| Name | Where | Purpose |
|------|-------|---------|
| `DATABASE_URL` | `apps/api/.env` | Neon **pooled** host (contains `-pooler`). Used by the running API. |
| `DIRECT_URL` | `apps/api/.env` | Same database, **direct** host (no `-pooler`). Used by `prisma migrate`. |
| `VITE_API_URL` | `apps/web/.env` | Optional. API base URL for the web app. Defaults to `http://localhost:3001`. |

`.env` files are gitignored. Never commit real connection strings.

### 3. Set up the database

```bash
cd apps/api
npx prisma migrate dev
npx prisma db seed
```

The seed adds three people, one project and one task. Running it twice does
not create duplicates.

Neon sleeps when idle. If you get "can't reach database server", wait a few
seconds and try again.

### 4. Run

Use two terminals, both from the project root:

```bash
npm run dev:api   # http://localhost:3001
```

```bash
npm run dev:web   # http://localhost:3000
```

Check http://localhost:3001/health returns `{"ok":true,...}`, then open
http://localhost:3000.

### Scripts

| Command (from root) | What it does |
|---------------------|--------------|
| `npm run dev:web` | Start the frontend in dev mode |
| `npm run dev:api` | Start the API in watch mode |
| `npm run build:web` | Build the frontend to `apps/web/dist` |
| `npm run build:api` | Build the API to `apps/api/dist` |

---

## API

| Method | Path | Success | Errors |
|--------|------|---------|--------|
| GET | `/health` | 200 | |
| GET | `/people` | 200, list of people | |
| POST | `/people` | 201, the new person | 400 invalid body, 409 duplicate email |
| DELETE | `/people/:id` | 204, no body | 404 unknown id |

**Validation rules for `POST /people`:**

- `name`: 2–80 characters
- `email`: valid email, stored trimmed and lowercased (`ADA@forge.test` is
  the same as `ada@forge.test`)
- `role`: optional, `intern` or `core`, defaults to `intern`

Example:

```bash
curl -s -X POST http://localhost:3001/people \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@forge.test"}'
```

The API only accepts browser requests from http://localhost:3000 (CORS in
`apps/api/src/main.ts`).

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
- [ ] Deploy (web to Cloudflare Pages, API host TBD)
