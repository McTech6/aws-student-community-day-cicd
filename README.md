# Forge

Forge is the **one** application this cohort builds after Spin-up. It is a
tiny internal studio tool — fake studio, fake people, fake work — so you
practice the REZA stack without touching client repos.

Think of it as a house you add rooms to. Week 5 you get a front door
(React). Week 6 a kitchen (NestJS). Week 7 a pantry that actually stores
food (Prisma + Neon). You do not remodel the street. Next.js is a short
extra *after* React is comfortable — it is not how Forge’s UI is built.

**Do not start this folder in week 1.** Finish [Hall](../spin-up/README.md),
then Foundations, then come back when your mentor opens the frontend module.

---

## What Forge is for

Forge helps a small studio track:

| Thing | Fields (keep them this small) |
|-------|-------------------------------|
| **People** | name, email, role: `intern` / `core` (fake) |
| **Projects** | name, status: `idea` / `active` / `done` |
| **Tasks** | title, status, optional project, optional assignee |

That is enough for lists, forms, relations, validation, and a deploy.

**Out of scope until capstone** (pick **one** later): tags, comments,
activity log, simple roles (admin vs member).

**Never:** real client names, production credentials, payments, file
uploads in v1.

---

## When you work here

| Phase | Typical weeks (Band B) | What you do in Forge |
|-------|------------------------|----------------------|
| Spin-up / Foundations | 1–4 | **Nothing.** Hall + vanilla JS live elsewhere |
| Frontend module | 5 | `apps/web` — React People list + form (API can be mocked) |
| Backend module | 6 | `apps/api` — `People` resource + validation |
| Data module | 7 | Prisma + Neon — real rows, unique email |
| Stitch week | 8 | UI talks to API talks to DB. **Full-stack gate** |
| Cloud + practices | 9–10 | Deploy, shared types, security checklist |
| Capstone | 11–12 | **One** small feature, plan approved first |

If your band is A, you may stay in Foundations longer. That is success if
you are actually learning. If your band is C/D, you still do Hall first;
then your mentor may let you reach this folder earlier **after** the
Foundations gate.

---

## How the folders fit

```
forge/
├── README.md                 You are here
├── package.json              npm workspaces (web + api + shared)
├── .env.example              Env *names* only. Copy, never commit .env
├── apps/
│   ├── web/                  React + Vite (TypeScript)
│   └── api/                  NestJS (TypeScript) + Prisma schema
└── packages/
    └── shared/               Shared types — use in practices week, not day one
```

| App | Port | Command (from `forge/`) |
|-----|------|-------------------------|
| Web | http://localhost:3000 | `npm run dev:web` |
| API | http://localhost:3001 | `npm run dev:api` |

The API has `GET /health` and a People resource (`GET /people`,
`POST /people`, `DELETE /people/:id`) stored in Postgres through Prisma.
The web People page reads and writes through that API, so the whole path is
real: form → Nest → Prisma → Neon → list. Projects and tasks exist in the
schema and the seed, but have no HTTP routes yet.

---

## What you need

Same laptop setup as week 1, plus later:

- Node.js **LTS** (same as Spin-up)
- Git, this repo, VS Code
- A **Neon** training database — your mentor provisions this before the
  data module. You will not have production mentor access.
- Ability to run two terminals (web + api)

You do **not** need Kubernetes, Docker, or a paid AI IDE.

---

## First-time setup (when your mentor says start Forge)

From the **intern-sandbox** repo:

```bash
cd forge
npm install
```

Copy env (data module — you can skip this until then):

```bash
copy .env.example apps\api\.env
```

On macOS/Linux: `cp .env.example apps/api/.env`

Fill `DATABASE_URL` and `DIRECT_URL` with the Neon strings your mentor gives
you (see Prisma below). **Never** paste them into Git, chat screenshots you
will commit, or the README.

### Run the shells

Terminal 1:

```bash
cd forge
npm run dev:web
```

Terminal 2:

```bash
cd forge
npm run dev:api
```

Check:

- Browser: http://localhost:3000 — Forge home page
- API: http://localhost:3001/health — `{"ok":true,...}`

### People API

The API needs `apps/api/.env` with a working `DATABASE_URL`, and the
migration applied (see Prisma below). From `forge/`:

```bash
npm run dev:api
```

That starts Nest on http://localhost:3001. People are rows in the `Person`
table, so restarting the API keeps them.

| Method | Path | Success | Failure |
|--------|------|---------|---------|
| GET | `/people` | 200 and the roster | |
| POST | `/people` | 201 and the new person | 400 bad body, 409 duplicate email |
| DELETE | `/people/:id` | 204, no body | 404 unknown id |

```bash
curl -s http://localhost:3001/people

curl -s -D - -X POST http://localhost:3001/people \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Ada\",\"email\":\"ada@forge.test\"}"

curl -s -D - -X POST http://localhost:3001/people \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Ada Again\",\"email\":\"ADA@forge.test\"}"
```

The second POST is a 409. Emails are stored trimmed and lowercased, so
`ADA@forge.test` is the same person as `ada@forge.test`. The `UNIQUE` index
on `Person.email` rejects the insert, and `PeopleService` turns Prisma's
`P2002` error into the 409. A short name, a missing field, or a role other
than `intern` or `core` is a 400. Role defaults to `intern` when you omit it.

`DELETE /people/:id` is a hard delete. Prisma's `P2025` (no such row) becomes
a 404. Tasks assigned to that person keep existing with no assignee, because
the foreign key is `ON DELETE SET NULL`.

```bash
curl -s -D - -X DELETE http://localhost:3001/people/<id-from-GET>
```

### People page (full stack)

Run both shells (web in one terminal, api in the other), then open
http://localhost:3000. The page loads `GET /people`, the form sends
`POST /people`, and Remove sends `DELETE /people/:id`.

- The web app calls `http://localhost:3001` by default. To change it, copy
  `apps/web/.env.example` to `apps/web/.env` and set `VITE_API_URL`.
- The API only accepts browser calls from http://localhost:3000 (CORS in
  `apps/api/src/main.ts`). Run the web app on that port.
- The form only checks for empty fields. Length, email format, and
  duplicates are decided by the API, and its 400/409 messages show in the
  form.
- Stop the API and reload the page to see the error state with Retry.

If install fails, paste the **full error** (not “it didn’t work”) to your
buddy, then your mentor. Do not “fix” it by deleting `package-lock.json`
unless asked.

### Prisma

`apps/api/.env` needs two Neon strings for the same database:

- `DATABASE_URL` is the pooled host (contains `-pooler`). The running API uses it.
- `DIRECT_URL` is the same string without `-pooler`. `prisma migrate` uses it,
  because migrations need a direct connection, not the pooler.

Neon sleeps when idle. If the first command says it "can't reach database
server", wait a few seconds and run it again. Then:

```bash
cd forge/apps/api
npx prisma migrate dev --name init
npx prisma db seed
```

`migrate dev` creates the tables and writes the SQL to
`prisma/migrations/<timestamp>_init/migration.sql`. Commit that folder.
`migrate` is what we use on Forge, not a forever `db push`. You should be
able to read the SQL file Prisma generates.

The seed (`prisma/seed.ts`) upserts three people, one project, and one task
that belongs to the project and is assigned to `ramsey@forge.test`. Running
it twice does not create duplicates.

To see the rows, open the Neon SQL editor:

```sql
SELECT id, name, email, role FROM "Person" ORDER BY "createdAt";

SELECT t.title, p.name AS project, a.email AS assignee
FROM "Task" t
LEFT JOIN "Project" p ON p.id = t."projectId"
LEFT JOIN "Person" a ON a.id = t."assigneeId";
```

Seed emails look like `ada@forge.test`. If you type a real person’s email,
delete the row and use fake data.

---

## Vertical slice (full-stack gate)

This is the demo you are aiming at. Not in week 1. Not all at once.

1. Open the People page  
2. Submit a person (name + email)  
3. Nest validates the DTO; duplicate email is rejected  
4. Prisma writes to Neon  
5. The list refreshes; empty and error states exist  

Until this gate passes: **no client tickets.**

---

## Git on Forge

Same rules as Hall. From repo root:

```bash
git checkout main
git pull origin main
git checkout -b intern/<your-slug>/people-list
```

Stay inside the files the module names. A 40-file “I also cleaned the
monorepo” PR will be sent back.

PR description = the planning ritual. README updates count as part of
done: if a buddy cannot boot from this README, you are not done with the
module.

---

## Env vars (names only)

| Name | Where | Purpose |
|------|--------|---------|
| `DATABASE_URL` | `apps/api/.env` | Postgres (Neon) pooled host. Server only. |
| `DIRECT_URL` | `apps/api/.env` | Same Neon database, direct host. Used by `prisma migrate`. |
| `VITE_API_URL` | `apps/web/.env` | Optional. API base URL for the web app. Defaults to `http://localhost:3001`. Public, never a secret. |

When you add more (API URL for the web app, Firebase, etc.), list the
**name** in `.env.example` and the real value only in local `.env`.

`.env` is gitignored. If you commit a secret, tell your mentor immediately.

---

## Architecture (keep this picture in your head)

```
Browser  →  apps/web (React + Vite, Cloudflare Pages later)
                ↓  HTTP JSON
            apps/api (NestJS)
                ↓  Prisma
            Neon (Postgres)
```

Firebase, if we add it, is for **auth** (Phase 3), not a second database
for people. Postgres is the source of truth for Forge data.

---

## Data rules

- Unique email on `Person` (database, not only the form)
- Fake emails: `someone@forge.test`
- Hard delete is fine for training
- Soft-delete, file uploads, payments: no

The Prisma schema in `apps/api/prisma/schema.prisma` already sketches
Person, Project, and Task. **Do not** migrate and wire everything on the
first Forge day. Follow the module. Extra tables are capstone material.

---

## What “done” looks like for a Forge module

- The gate in that module’s brief (demo + oral questions)
- README still boots a buddy (how to run web, api, migrate)
- No secrets in the diff
- You can explain every line you added

---

## Learn (when you get there)

Use **official docs**, not a random YouTube stack:

- [React: Learn](https://react.dev/learn)
- [Vite: Getting started](https://vite.dev/guide/)
- [NestJS first steps](https://docs.nestjs.com/first-steps)
- [NestJS validation](https://docs.nestjs.com/techniques/validation)
- [Prisma schema](https://www.prisma.io/docs/orm/prisma-schema/overview)
- [Prisma + PostgreSQL](https://www.prisma.io/docs/orm/overview/databases/postgresql)

If a tutorial conflicts with this folder layout, **Forge wins**.

---

## Mentor / infra notes (interns: skip unless asked)

- Neon: training project, free tier. One DB per intern **or** one DB with
  an intern slug — mentor’s choice.
- Cloudflare Pages for `apps/web` in the cloud module (Vite `dist/`), not week 5.
- API host: whatever REZA already uses for small Node apps. If the API
  stays local this cohort, that constraint belongs in this README — do not
  invent a host.
- Interns are collaborators. Branches: `intern/<slug>/...`. No production
  mentor access on Cloudflare / Neon / Firebase.

---

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `npm install` from `spin-up/` or repo root | `cd forge` first |
| Building People in week 1 | Close this folder; finish Hall |
| Committing `.env` | Remove from git, rotate the URL, tell mentor |
| Copy-pasting a different monorepo layout | This `apps/web` + `apps/api` split is the course |
| `any` everywhere in TypeScript | Prefer real types; shared types come in practices week |
| Real client names “just for realism” | Use `@forge.test` |

Questions go to your buddy, then your mentor. That is the job.
