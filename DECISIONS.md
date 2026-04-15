# SoccerTrack — Decisions & Interview Talking Points

A running log of the engineering decisions made on this project, why they were
made, and how to talk about them in interviews. The project is a personal tool
for scoring a youth soccer team from replay video — roster, lineups with open
subbing, and per-player/per-position stat tracking.

New entries go at the top. Each entry has: **decision**, **why**, **tradeoff**,
and **interview framing** (the sentence-or-two version to use under pressure).

---

## Stack

- **Backend:** Django 6.0 + Django REST Framework
- **Database:** SQLite (dev), Postgres-ready
- **Frontend:** React + Vite (planned)
- **Python:** 3.14 in a project-local `.venv`

---

## Decisions

### Decision — One venv per project; `requirements.txt` pins exact versions

**Why:** Installing Django globally on my machine would create version conflicts
the moment I start a second Python project. A venv isolates dependencies so
this project always has the exact Django it was built against, regardless of
what's installed elsewhere.

**Tradeoff:** One extra command at project start (`python -m venv .venv`) and
every terminal needs the venv activated. Trivial cost for the isolation
guarantee.

**Interview framing:** *"I keep one virtual environment per Python project and
pin exact versions in requirements.txt so dependencies stay isolated and the
project is reproducible on any machine."*

---

### Decision — `DurationField` for game clock, not `CharField` of `"mm:ss"` strings

**Why:** The app has to compute things like "minutes played at LW" — slot
end minus slot start. If game times are strings I'd parse them every time
and silently misbehave on a malformed value. `DurationField` stores a
`timedelta`, subtracts cleanly, and displays however the UI wants (mm:ss,
minute-rollup, whatever).

**Tradeoff:** The UI sends `"HH:MM:SS"` or seconds instead of a free-text
string. Negligible.

**Interview framing:** *"Game-clock values are computed against, not just
displayed, so I stored them as DurationField rather than CharField — lets me
subtract two slots to get minutes played without parsing strings at read
time."*

---

### Decision — Stat hierarchy stored shallow; expanded at read time

**Why:** A goal implies a shot-on-frame, which implies a shot. Two ways to
handle that:
1. Store every implied row (1 click → 3 rows for a goal).
2. Store only the most specific stat and expand at read time.

I chose (2). Matches the project's "never edited — only inserted or deleted"
rule cleanly (one click = one row, one undo = one delete). The hierarchy is
a module-level constant `STAT_ROLLUP`, and the `rollup_counts()` helper
returns the expanded totals. Adding "assist" or "save" later is a one-line
change to choices + hierarchy.

**Tradeoff:** Every report has to run the rollup helper instead of a raw
`count()`. Acceptable — the helper is 4 lines and centrally located.

**Interview framing:** *"Stat events have a hierarchy — a goal is also a
shot on frame, which is also a shot. I stored only the most specific event
and expand the hierarchy at read time via a small helper. It keeps one
click equal to one row, which keeps undo simple and keeps the audit trail
honest."*

---

### Decision — Enforce "one player per position at a time" at the DB layer, not the app layer

**Why:** A partial `UniqueConstraint` with `condition=Q(time_off__isnull=True)`
is a **partial unique index** — the DB itself rejects a second active player
at the same position. If the rule only lived in application code, any future
view, admin action, or script that forgot to check would silently corrupt the
data. DB constraints are the last line of defense.

Two constraints:
1. One active player per `(game, position)`.
2. One active slot per `(game, player)` (a player can't be at two positions
   at once).

Both conditioned on `time_off IS NULL` so closed historical rows don't block
new ones.

**Tradeoff:** `IntegrityError` has to be caught and translated to a
user-friendly message at the API layer. Worth it.

**Interview framing:** *"Business rules like 'only one player at a position
at a time' live in the database as partial unique constraints, not just in
application code. The app validates for UX, but the database is what
guarantees the rule can never be violated."*

---

### Decision — `move_player()` helper wraps the close-old-then-open-new transition

**Why:** Moving a player from LM to LW is two DB writes: close the LM slot
with `time_off = now`, open a new LW slot with `time_on = now`. Every view
that does this has to get both writes right. Concentrating that logic into
one model classmethod means the rule lives in one place, is testable in
isolation, and the calling code reads like English:
`PlayerGameSlot.move_player(game, player, 'LW', current_clock)`.

**Tradeoff:** One more method on the model. Cheap.

**Interview framing:** *"Operations that span multiple writes go in a helper
on the model. That way the rule lives in one place, is unit-testable without
going through a view, and any caller that forgets a step is impossible by
construction."*

---

### Decision — Strict "insert or delete, never edit" for stat events

**Why:** Every row represents one [+] click I made while watching replay.
Allowing edits means a typo at 34:22 gets silently corrected to 34:18, and
the audit trail no longer reflects what I actually clicked. Strict
insert-or-delete keeps the event log equivalent to my click history. If a
stat is logged wrong, I click [-] to remove it and [+] to re-add it — two
clicks, no data integrity cost.

**Tradeoff:** Two clicks instead of an edit. I accepted this because seconds
don't matter for soccer stats (they get reported in "the 31st minute"), so
tiny timestamp drift from a re-insert is irrelevant.

**Interview framing:** *"Stat events are append-only. Every row represents
one explicit click, and the [-] button deletes the most recent match. That
keeps the event log isomorphic to the user's action log, which makes any
downstream analysis trustworthy."*

---

### Decision — Tests before UI

**Why:** The model helpers (`move_player`, `undo_last`, `rollup_counts`,
`minutes_played`) are pure Python and easy to test. A bug in any of them
would show up as a UI bug later ("her minutes are wrong"), and debugging a
UI problem that's actually a model problem eats hours. Writing tests first
proves the helpers work, so when a UI bug appears I can trust the foundation
and look higher up the stack.

**Tradeoff:** An afternoon of test writing before the first React screen is
visible. Pays back the first time something breaks.

**Interview framing:** *"I test model-layer helpers before wiring UI on top
of them. If a bug surfaces later, I know the foundation is sound and the
problem is somewhere in the frontend or API layer — that narrows the search
from three places to one."*

Test file: [`tracker/tests.py`](tracker/tests.py) — 12 tests, ~16ms run time.

---

### Decision — TypeScript over JavaScript on the frontend

**Why:** Type errors caught at compile time are cheaper than bugs caught
in production. More importantly, because the backend exposes an OpenAPI
schema, the frontend can generate TypeScript types from it directly —
every API call becomes type-checked against the real backend shape. Rename
a serializer field, regenerate the types, and every frontend call site
that used the old name fails to compile. With plain JS, that same change
breaks silently at runtime.

**Tradeoff:** Slightly more syntax; occasional fights with types for
edge cases. Trivial compared to the correctness guarantee.

**Interview framing:** *"TypeScript on the frontend, not JavaScript —
specifically so the OpenAPI schema the backend emits can drive a typed
client. If a serializer changes shape on the backend, regenerating types
makes the frontend fail to compile at every call site that needs updating.
That's the single biggest compounding benefit of TS + DRF together."*

---

### Decision — Vite, not Create React App

**Why:** Create React App was React's official scaffold from 2016–2023; it
was officially deprecated in early 2025. Vite replaced it as the
community default because it uses native ES modules for the dev server
(sub-second hot reload even on large projects) and bundles with Rollup
for production. No ejection, no webpack config to maintain, no legacy
Babel pipeline.

Every new React tutorial, every recent job posting that mentions React
tooling, assumes Vite.

**Tradeoff:** None that matters for new projects. CRA has a larger
historical ecosystem, but that ecosystem has all migrated to Vite.

**Interview framing:** *"I use Vite for React scaffolds. CRA was
deprecated in 2025; Vite is the community default now — faster dev
server, cleaner config, no webpack layer to maintain."*

---

### Decision — `openapi-typescript` + `openapi-fetch` as the client stack

**Why:** Two tiny libraries do what a heavy HTTP client (axios, etc.)
used to do, but typed end-to-end against the backend schema:

- **openapi-typescript** reads the OpenAPI schema at `/api/schema/` and
  emits a `.d.ts` types file.
- **openapi-fetch** is a thin wrapper around the browser's native `fetch`.
  It takes those generated types as a generic and type-checks every call
  path, method, body, and response.

Call sites look like `api.POST('/api/players/', { body: {...} })`, and
TypeScript verifies the URL is a real endpoint, the method is allowed,
and the body matches the expected schema. All at compile time. No
runtime dependency on a bulky HTTP library.

**Tradeoff:** Smaller ecosystem than axios. I've never needed anything
axios offers that fetch doesn't.

**Interview framing:** *"The frontend's HTTP layer is openapi-fetch
driven by openapi-typescript. The backend's OpenAPI schema becomes
TypeScript types; the fetch client is generic over those types. Every
URL, method, and payload shape is checked at compile time against the
real backend contract, with no axios-sized runtime dependency."*

---

### Decision — TypeScript 5.6 (not 6.0) for now

**Why:** Vite's latest template ships TypeScript 6.0 (released early
April 2026). The broader ecosystem — including `openapi-typescript`,
which we rely on — still declares a peer dependency on TS 5.x. Installing
with TS 6 produced an `ERESOLVE` failure. Downgrading to TS 5.6 resolved
it cleanly and costs us nothing; TS 6 is a minor-on-major version and
adds nothing we need.

General pattern: a just-released major version of a language/runtime is
ahead of the ecosystem for weeks-to-months. Unless a specific feature is
required, stay one major behind until peer ranges catch up.

**Tradeoff:** We'll need to bump to TS 6 eventually. When the ecosystem
catches up, one `npm install typescript@latest` and we're current.

**Interview framing:** *"When a tooling dependency blew up on TypeScript
6 right after its release, I downgraded to 5.6 rather than forcing the
resolution. Ecosystem lag on major versions is real — most libraries
take a few months to update their peer ranges. Staying one major behind
on a just-released language version is usually the cheaper call."*

---

### Decision — Fat models, thin views

**Why:** Business logic lives on the models, not in the views. Every
meaningful operation — `move_player`, `undo_last`, `rollup_counts`,
`minutes_played` — is a classmethod on the model. The view layer just
routes, filters query params, and serializes the output.

Two concrete payoffs:
1. **Tests run without HTTP.** The unit tests in `tests.py` call
   `PlayerGameSlot.move_player(...)` directly. No test client, no
   request/response cycle, no serializer round-trip. Fast (16ms for the
   model-layer tests) and failures point straight at the logic.
2. **Views stay readable.** `rollup` is 10 lines. The complex part is
   `rollup_counts()` on the model, tested in isolation. If the view
   started growing loops and conditionals, that'd be a signal the logic
   belongs on the model.

**Tradeoff:** Not every operation has a natural home on a single model.
Cross-model orchestration ("start a new game with a default lineup")
eventually wants a separate service layer. I'll cross that bridge when I
hit it.

**Interview framing:** *"I follow the fat-models / thin-views Django
convention. Domain logic like 'move a player between positions' or
'expand the stat hierarchy' lives as classmethods on the model, so tests
exercise the real logic without going through HTTP. Views become thin
routers — filter query params, call the helper, serialize the result."*

---

### Decision — OpenAPI schema via `drf-spectacular` as the API contract

**Why:** Once a frontend exists, "what endpoints are there and what shape
do they take?" becomes the single most asked question. Three ways to
answer it:
1. Hand-written docs (goes stale the moment code changes).
2. DRF's browsable API (great for exploration, not machine-readable).
3. An OpenAPI schema generated from the serializers and viewsets
   themselves.

I picked (3). `drf-spectacular` introspects the existing serializers,
viewsets, and URL patterns and emits an OpenAPI 3.0 spec — a
machine-readable contract that stays in sync with the code. No duplicated
documentation, no drift.

Three endpoints this gives us:
- `GET /api/schema/` — raw OpenAPI YAML/JSON.
- `GET /api/docs/` — Swagger UI (interactive, try-it-out buttons).
- `GET /api/redoc/` — ReDoc (cleaner reference-style docs).

Downstream: a TypeScript client can be auto-generated from the schema so
the React side gets type-checked calls with zero hand-written boilerplate.

**Tradeoff:** One more dependency; `@extend_schema` decorators are
occasionally needed to clarify return shapes for custom actions that
aren't fully inferable. Small.

**Interview framing:** *"The API contract is generated from the code, not
maintained alongside it. drf-spectacular introspects the serializers and
viewsets to emit an OpenAPI schema, which serves Swagger UI for humans
and a typed client generator for the frontend. Single source of truth,
no drift between docs and reality."*

---

### Decision — `ModelSerializer` for CRUD, plain `Serializer` for action payloads

**Why:** DRF serializers translate between JSON and Python/model objects in
both directions — serialize for GET responses, deserialize + validate for
POST/PATCH. Two flavors fit two different jobs.

`ModelSerializer` introspects a Django model and auto-generates fields from
it. Used for CRUD endpoints (`PlayerSerializer`, `GameSerializer`, etc.) —
it handles validation, save, and response shape with almost no code.

Plain `Serializer` is for action payloads that don't correspond to a single
row. `MoveSlotSerializer` and `UndoStatSerializer` validate the incoming
JSON for the `/slots/move/` and `/stats/undo/` endpoints, but the view
calls a model helper instead of saving a new row. Using a `Serializer`
(not `ModelSerializer`) is the honest choice — there's no model to back it.

**Tradeoff:** Two patterns in the serializer layer instead of one. Worth it
because forcing action inputs through `ModelSerializer` would be lying to
the reader about what they represent.

**Interview framing:** *"I use ModelSerializer for CRUD — it introspects the
model to handle validation, save, and response formatting — and plain
Serializer for action endpoints that validate a payload but don't
correspond to a single row. That keeps the serializer type honest about
what each endpoint does."*

---

### Decision — Nested-read / FK-write pattern on slot and stat serializers

**Why:** The frontend wants a whole player object embedded on GET (so it
can show name + jersey without a second request) but wants to send just a
player ID on POST (sending the full object on write is wasteful and
redundant).

`PlayerGameSlotSerializer` exposes two fields for the same underlying FK:
`player` (nested PlayerSerializer, read-only) and `player_id`
(PrimaryKeyRelatedField, write-only, `source='player'`). Response JSON gets
the nested object; request JSON only needs the ID.

**Tradeoff:** Slightly more serializer code. The alternative — a single
`PrimaryKeyRelatedField` — forces the frontend to issue a second request
to fetch player details, which costs latency and round-trips.

**Interview framing:** *"On write-heavy resources like slots I use the
read/write-asymmetric serializer pattern — the client sends a foreign-key
ID on POST but gets a nested object back on GET. It eliminates a follow-up
request on every list view without inflating the write payload."*

---

### Decision — Custom actions via `@action` instead of new URLs per verb

**Why:** Endpoints like "move player to a new position" and "undo the last
stat" aren't plain CRUD, but they belong to a resource (slot, stat).
DRF's `@action` decorator attaches them directly to the ViewSet:

```
POST /api/slots/move/    → PlayerGameSlotViewSet.move
POST /api/stats/undo/    → StatEventViewSet.undo
GET  /api/games/5/rollup/ → GameViewSet.rollup
```

The alternative — a separate view class per action, manually wired in
urls.py — works but fragments the code. Using `@action` keeps each
resource's CRUD + its custom operations in the same class.

**Tradeoff:** `@action` is DRF-specific, not Django-generic. Anyone who
learns DRF knows it. Not a real cost.

**Interview framing:** *"Custom actions hang off their resource's ViewSet
via @action, which keeps all the endpoints for a resource — CRUD and
otherwise — in one class. `detail=True` for per-object actions, `detail=False`
for collection-level ones. Standard DRF idiom."*

---

### Decision — Git Bash as the default shell on Windows, not PowerShell

**Why:** Production servers run Linux, which means Bash (or zsh). Docker
images, CI/CD runners, AWS EC2 instances, every Django/Node tutorial, every
README — they all assume Bash syntax. Using Git Bash locally means the
commands I type while developing are the same commands I'll type when I SSH
into a server six months into a SWE job. Same muscle memory, no context
switch.

**Tradeoff:** Bash on Windows has gotchas — backslashes are escape
characters, so `.venv\Scripts\python.exe` gets mangled into
`.venvScriptspython.exe`. Fix is forward slashes, which Windows accepts
everywhere. PowerShell is more "native" on Windows but doesn't transfer to
Linux servers.

**Interview framing:** *"I run Git Bash on Windows so my local shell matches
the Linux servers I'll eventually deploy to. Same commands, same syntax, no
mental translation when I SSH into a production box."*

---

### Decision — Django admin for development convenience, React for real use

**Why:** Django's built-in admin gives me a free CRUD UI for every model the
moment I register it. That means I can add a player or a game without any
frontend existing yet — huge for early development. The admin stays
forever as a dev/ops tool ("something's broken, let me fix this row by
hand") but won't be the normal scoring interface.

**Tradeoff:** The admin is powerful but not the end-user experience. Not a
real tradeoff — it's a development tool, not the product.

**Interview framing:** *"Django's admin is my scaffolding for the first
month of a project — it lets me exercise the data model without waiting
for a frontend. Once the real UI exists, admin stays as an emergency ops
tool."*

---

## Talking points by category (grab-and-go for interviews)

### "Tell me about a side project"

SoccerTrack is a Django + React app for scoring a youth soccer team from
replay video. Four models: players, games, player-game-slots (the
lineup/subbing table), and stat events. The interesting design problems
were (1) how to model a player who can move between positions mid-game,
(2) how to store a stat hierarchy where goal→on-frame→shot are nested,
and (3) how to enforce lineup integrity at the database layer rather than
trusting application code. It's running on Django 6 with a test suite
covering the model-layer helpers and the uniqueness constraints.

### "Tell me about a time you wrote tests"

In SoccerTrack I wrote the model helpers — `move_player`, `undo_last`,
`rollup_counts`, `minutes_played` — and then wrote 12 tests covering each
helper plus the DB-level uniqueness constraints. One test deliberately
triggers an `IntegrityError` by trying to put two players at the same
position at the same time and asserts the DB rejects it. Suite runs in
16 milliseconds, which keeps the feedback loop tight.

### "Tell me about a design decision you made"

In SoccerTrack, stat events have a natural hierarchy — a goal counts as a
shot on frame, which counts as a shot. Two reasonable models: store every
implied row on each click, or store only the most specific event and
expand at read time. I chose the second because it keeps the "one click
equals one row" invariant, which means the [-] button is a single delete
and the audit trail reflects my actual click history. The tradeoff is
every report has to run a small rollup helper, but that's four lines in
one central place.

### "Tell me about a time you pushed back on a requirement"

*[Placeholder — fill in when it happens.]*

### "Walk me through your architecture"

Django backend, REST API via DRF, React + Vite frontend. Django admin for
development and ops. SQLite locally, Postgres-ready for any eventual deploy.
Tests live at the model layer; I haven't built integration tests yet
because the frontend isn't wired up.

---

## Memory log (fill in as decisions happen)

- **2026-04-15** — Added four frontend-stack decisions: TypeScript over
  JS, Vite over CRA, openapi-typescript + openapi-fetch as the client
  stack, TypeScript 5.6 pin (ecosystem lag on TS 6).
- **2026-04-15** — Added fat-models-thin-views decision.
- **2026-04-15** — Added drf-spectacular / OpenAPI schema decision.
- **2026-04-15** — Added three API-layer decisions: `ModelSerializer` vs
  plain `Serializer`, nested-read/FK-write pattern, custom actions via
  `@action`.
- **2026-04-15** — Added Git-Bash-over-PowerShell decision.
- **2026-04-15** — Initial decision log created. Captures the five key
  model-layer decisions made during the schema design session:
  `DurationField` over `CharField`, stat rollup at read time, DB-layer
  uniqueness constraints, `move_player` helper, strict insert-or-delete
  on stat events.
