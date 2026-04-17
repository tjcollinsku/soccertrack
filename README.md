# SoccerTrack

A personal tool for scoring a youth soccer team from replay video —
roster, lineups with open subbing, and per-player/per-position stat
tracking. Built as a full-stack learning project with a focus on
production-shaped backend engineering choices.

**Live at:** [stats.warriorgirlssc.com](https://stats.warriorgirlssc.com)

**Stack:** Django 6 · DRF · drf-spectacular · React 19 · TypeScript · Vite 7 · PostgreSQL · Railway

---

## What's in here

- **[tracker/models.py](tracker/models.py)** — four models (Player,
  Game, PlayerGameSlot, StatEvent) with database-level uniqueness
  constraints that enforce "one active player per position" and "one
  active slot per player."
- **Model helpers** — `move_player`, `undo_last`, `rollup_counts`,
  `minutes_played`. Domain logic lives on the models, not in views.
- **REST API** — resource-oriented endpoints under `/api/`, with
  custom actions via `@action` for lineup management, stat logging,
  substitutions, game lifecycle, and season-wide stat aggregation.
- **OpenAPI schema** generated from code via drf-spectacular. Swagger UI
  at `/api/docs/`.
- **Typed frontend client** — React calls generated from the backend
  schema; if a serializer changes shape, the frontend fails to compile.
- **Full React frontend** — six pages:
  - **Roster** — add/edit players
  - **Games** — create and list games
  - **Game Setup** — assign starting XI to a 4-3-3 formation
  - **Live Tracker** — FPL-inspired pitch layout with per-player stat
    +/- buttons, game clock with sessionStorage persistence, substitution
    flow, and Game Over lifecycle
  - **Game Summary** — per-player stats table with expandable
    per-position stat breakdown
  - **Season Stats** — aggregated stats across all completed games,
    with dropdown to view individual past games and per-position
    breakdown
- **Position-aware stat display** — GK sees Pa/Cm/Sv; field players
  see Pa/Cm/Dr/Dw/Sh/Fr/Gl/Tk. Switches dynamically on position change.
- **Warriors theme** — red/black color scheme with pitch-realistic
  gradient, mow-line stripes, and visible pitch markings (halfway line,
  center circle, penalty boxes)
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
| http://localhost:5173/ | React app (all pages) |
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
- [x] Games page (list + create games)
- [x] Game Setup page (assign starting XI to 4-3-3 formation)
- [x] Live Tracker (pitch diagram, stat +/- buttons, game clock, sub flow, game over)
- [x] Game Summary page (per-player stats table with calculated percentages)
- [x] Season Stats page (aggregated stats across all games)
- [x] Warriors color scheme (red/black theme with FPL-inspired pitch layout)
- [x] Sv (Save) stat type for goalkeepers + position-aware stat display
- [x] Per-position stat breakdown (expandable rows in Summary + Stats)
- [x] Game selector dropdown on Stats page (season total + individual games)
- [x] Deploy to Railway with PostgreSQL + custom domain (stats.warriorgirlssc.com)
