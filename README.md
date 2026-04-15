# SoccerTrack

A personal tool for scoring a youth soccer team from replay video —
roster, lineups with open subbing, and per-player/per-position stat
tracking. Built as a full-stack learning project with a focus on
production-shaped backend engineering choices.

**Stack:** Django 6 · DRF · drf-spectacular · React 19 · TypeScript · Vite

---

## What's in here

- **[tracker/models.py](tracker/models.py)** — four models (Player,
  Game, PlayerGameSlot, StatEvent) with database-level uniqueness
  constraints that enforce "one active player per position" and "one
  active slot per player."
- **Model helpers** — `move_player`, `undo_last`, `rollup_counts`,
  `minutes_played`. Domain logic lives on the models, not in views.
- **REST API** — resource-oriented endpoints under `/api/`, with
  custom actions via `@action` for operations that don't fit pure CRUD.
- **OpenAPI schema** generated from code via drf-spectacular. Swagger UI
  at `/api/docs/`.
- **Typed frontend client** — React calls generated from the backend
  schema; if a serializer changes shape, the frontend fails to compile.
- **18 tests**, all model- and API-layer. Runs in ~40ms.

See [DECISIONS.md](DECISIONS.md) for the engineering choices and why each
one was made.

---

## Running locally

**Prereqs:** Python 3.14, Node 20+, Git.

```bash
# Backend
python -m venv .venv
source .venv/Scripts/activate      # Git Bash on Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser   # admin login
python manage.py runserver         # http://127.0.0.1:8000/

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                        # http://localhost:5173/
```

**URLs once both are running:**

| URL | Purpose |
|---|---|
| http://localhost:5173/ | React app (roster page so far) |
| http://127.0.0.1:8000/admin/ | Django admin (add players/games by hand) |
| http://127.0.0.1:8000/api/ | Browsable DRF API |
| http://127.0.0.1:8000/api/docs/ | Swagger UI |
| http://127.0.0.1:8000/api/schema/ | Raw OpenAPI spec |

---

## Regenerating the typed API client

After changing a serializer on the backend, regenerate the frontend types:

```bash
cd frontend
npm run generate:api
```

This fetches `/api/schema/` and writes `src/api/schema.d.ts`. Any
frontend call site that depended on the old shape will fail to compile
until updated.

---

## Tests

```bash
python manage.py test tracker -v 2
```

---

## Status

- [x] Data model + migrations
- [x] Model-layer helpers + unit tests
- [x] REST API + custom actions
- [x] OpenAPI schema + Swagger UI
- [x] React scaffold + typed client
- [x] Roster page (list + create players)
- [ ] Games page
- [ ] Live scoring screen (pitch diagram, stat buttons, clock)
- [ ] Stats rollup + report views
