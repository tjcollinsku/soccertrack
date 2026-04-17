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
- **Database:** SQLite (dev), PostgreSQL (prod / Railway)
- **Frontend:** React 19 + TypeScript 5.6 + Vite 7
- **Python:** 3.14 (dev), 3.12 (prod / Nixpacks)
- **Deploy:** Railway (Nixpacks) + WhiteNoise + gunicorn
- **Domain:** stats.warriorgirlssc.com

---

## Decisions

### Decision — Downgrade Vite 8 → 7 for deploy compatibility

**Why:** Vite 8 requires Node ≥22.12.0, but Railway's Nixpacks builder
pins Node 22 to an older minor (22.10.0) via its nixpkgs channel snapshot.
Rather than fighting the Nix package pinning or using a custom Dockerfile,
downgrading to Vite 7 (which supports Node 18+) removed the tight version
coupling entirely. The build worked on the first try after the downgrade.

**Tradeoff:** Vite 7 vs 8 has no feature differences that matter for this
project. When Nixpacks updates its Node 22 package, upgrading back is a
one-line `npm install vite@^8`.

**Interview framing:** *"The deploy failed because the build tool required
a newer Node minor than the platform provided. Rather than customizing the
build image, I downgraded one major version of the bundler — zero
feature cost, and it decoupled the build from a specific Node patch level.
Fight the constraint that's cheapest to change."*

---

### Decision — WhiteNoise for static files, not nginx or a CDN

**Why:** Django's built-in `staticfiles` app doesn't serve files
efficiently in production. The standard answer is nginx in front, but
that means a separate process or container. WhiteNoise serves compressed
static files directly from gunicorn — one process, one container, zero
config. For a low-traffic app like this, it's the right tradeoff.

The React build output (JS/CSS bundles) gets collected into Django's
`staticfiles/` directory via `collectstatic`, and WhiteNoise serves them
with proper caching headers and gzip/brotli compression.

**Tradeoff:** At high traffic, a CDN or nginx would be faster. For a
youth soccer stat tracker used by ~20 parents, WhiteNoise is more than
enough and eliminates ops complexity.

**Interview framing:** *"I use WhiteNoise to serve static files directly
from gunicorn — one process, no nginx layer, no CDN configuration.
It handles compression and cache headers out of the box. For a
low-traffic app it's the right call; if traffic grew I'd put a CDN in
front, but the architecture doesn't change."*

---

### Decision — Django serves the React SPA via catch-all route

**Why:** In production, the React app is a set of static files (JS, CSS)
plus one `index.html`. The standard SPA pattern: serve `index.html` for
every route that isn't an API call, and let React Router handle the
client-side routing. Django's catch-all `re_path` does this:

```python
re_path(r'^(?!api/|admin/).*$', TemplateView.as_view(template_name='index.html'))
```

This means one deployment artifact (Django + built React), not two
separate services. The API and the frontend share one domain, no CORS
issues in production.

**Tradeoff:** Tighter coupling between backend and frontend deploys. For
a solo project this is a feature, not a bug — one `git push` deploys
everything.

**Interview framing:** *"The React SPA is served by Django via a catch-all
route — any path that isn't /api/ or /admin/ returns index.html, and
React Router takes over client-side. One deploy artifact, one domain,
no CORS in production."*

---

### Decision — Railway's SSL termination, not Django's SECURE_SSL_REDIRECT

**Why:** Railway's proxy terminates SSL and forwards plain HTTP to the
application container. If Django also has `SECURE_SSL_REDIRECT = True`,
it sees an HTTP request and redirects to HTTPS, which Railway's proxy
receives and forwards as HTTP again — infinite redirect loop.

The fix: set `SECURE_SSL_REDIRECT = False` and instead set
`SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')` so
Django trusts the proxy's header and treats the connection as secure
for CSRF, cookies, and HSTS purposes.

**Tradeoff:** Django trusts the `X-Forwarded-Proto` header, which means
the proxy must be the only thing setting it. Railway controls the proxy,
so this is safe.

**Interview framing:** *"Hit an infinite redirect loop on deploy because
both the reverse proxy and Django were trying to enforce HTTPS. The fix
was letting the proxy handle SSL termination and telling Django to trust
the X-Forwarded-Proto header instead of redirecting itself. Standard
pattern for any PaaS with a reverse proxy layer."*

---

### Decision — Position-aware stat display (GK vs field players)

**Why:** Goalkeepers and field players track different stats. Showing
tackles and dribbles on a GK card is noise; showing saves on a striker
is meaningless. The tracker now uses a `GK_STAT_KEYS` set to filter
which stat buttons appear based on the player's current position. GK
sees Pa/Cm/Sv; field players see the full 8-stat set.

The filtering is dynamic — if a field player moves to GK mid-game
(emergency sub), their stat buttons update immediately.

**Tradeoff:** Slightly more complex rendering logic. Worth it — the
tracker is used during live games where visual noise costs real
attention.

**Interview framing:** *"Stat buttons are position-aware — goalkeepers
see a different set than field players, and it switches dynamically on
position change. The filtering is a simple Set lookup in the render
loop, but the UX improvement is significant when you're tracking stats
in real time during a game."*

---

### Decision — Per-position stat breakdown via expandable rows

**Why:** A player who plays 30 minutes at LW and 30 minutes at CM has
different stats in each position. The summary and season stats pages
now show expandable rows — click a player to see their stats broken
down by position. The backend queries `StatEvent` rows that fall within
each `PlayerGameSlot` time window to attribute stats to the position
the player was playing when the stat was recorded.

**Tradeoff:** More complex backend query (stats filtered by slot time
windows) and more frontend state (expanded/collapsed row tracking).
Worth it — position-level analysis is the whole point of tracking
formations.

**Interview framing:** *"Stats are attributed to the position the player
was playing when the event happened, not just to the player. The backend
filters stat events by each slot's time window, so a player who moved
from wing to midfield mid-game gets separate stat lines for each
position. Click to expand in the UI."*

---

### Decision — Game selector dropdown on Stats page

**Why:** The Stats page originally only showed season totals. Parents
want to review individual past games too. Rather than a separate page
per game, a dropdown at the top switches between "Season Total" and
any completed game. Season view fetches from `/api/players/season_stats/`;
game view fetches from `/api/games/{id}/stats/`. Same table component,
different data source.

**Tradeoff:** One page doing double duty. Clean enough for now; if the
views diverge significantly later, split them.

**Interview framing:** *"The Stats page serves both season-wide and
per-game views via a dropdown selector. Same table layout, different
backend endpoint. Keeps the UI simple — parents don't need to learn
two different pages."*

---

### Decision — FPL-inspired pitch layout with row-based flexbox, not CSS grid

**Why:** The original tracker used a CSS grid with explicit `gridRow`/`gridColumn`
on every card. This produced a rigid, spreadsheet-like layout that didn't
resemble a real pitch. The Fantasy Premier League "Team of the Week" layout
was the visual target — each formation row (forwards, midfield, defense, GK)
is its own centered flex container, cards float on a realistic pitch with
visible markings, and each row has natural spacing.

Switched the JSX from a single flat `FORMATION` array with row/col coordinates
to `FORMATION_ROWS` — an array of `{ label, positions[] }` objects. Each row
renders as a `<div className="pitch-row">` with `display: flex;
justify-content: center`. The pitch itself uses a radial gradient with
repeating stripe overlay for mow lines, plus absolutely-positioned divs for
halfway line, center circle, penalty boxes, and penalty arcs.

**Tradeoff:** More CSS and more DOM elements for the pitch markings. Cards
are slightly harder to target individually since they no longer have grid
coordinates. Worth it — the pitch now looks like a pitch.

**Interview framing:** *"The formation layout uses row-based flexbox instead
of CSS grid — each line of the formation is a centered flex container. Grid
was too rigid for the visual I wanted; flex gives natural centering and
spacing per row. Pitch markings are positioned divs inside a markings
container so they don't interfere with card layout."*

---

### Decision — Session-scoped clock persistence via sessionStorage

**Why:** The game clock runs in React state (a `setInterval` incrementing
seconds). Navigating away from the tracker page unmounts the component and
destroys the clock. Without persistence, a parent who checks the summary
mid-game returns to find the clock reset to 0:00 and player minutes going
negative.

`sessionStorage` fixes this: the clock writes its value on every tick, and
restores it on mount. Session-scoped (not `localStorage`) so it doesn't
leak across tabs or persist after closing the browser — a stale clock from
last week's game would be worse than no persistence at all.

**Tradeoff:** One storage write per second per game. Trivial.

**Interview framing:** *"The game clock persists to sessionStorage on every
tick so navigating away and back doesn't reset it. I used sessionStorage
instead of localStorage because a stale clock from a previous browser
session is worse than no clock — session scope matches the lifecycle of
one game."*

---

### Decision — Stat rollup applied in both backend and frontend

**Why:** The stat hierarchy (goal → shot on frame → shot; completed pass →
pass attempt; dribble won → dribble attempt) is expanded at read time by
the backend's `rollup_counts()` helper. But the frontend uses optimistic
updates — when a user clicks [+] for a goal, the UI increments the count
immediately without waiting for the API response.

If the frontend only incremented the clicked stat, the user would see goals
go up but shots stay at 0 until the next full data reload. So the same
`STAT_ROLLUP` constant exists in both the backend (`models.py`) and the
frontend (`GameTracker.tsx`), and the frontend applies it during optimistic
updates.

**Tradeoff:** Duplicated hierarchy definition across two languages. The
hierarchy is small (4 rules) and stable, so the duplication is manageable.
If it grew, I'd expose it via the API.

**Interview framing:** *"The stat hierarchy is duplicated between backend
and frontend — the backend expands it at query time, and the frontend
applies the same rules during optimistic updates so the UI stays consistent
without waiting for the API round-trip. It's a pragmatic trade: duplicating
four rules beats adding latency to every stat click."*

---

### Decision — Game Over flow gates the summary page

**Why:** The summary page shows minutes played per player, which requires
all `PlayerGameSlot` rows to have their `time_off` set. Without a Game Over
step, a user could navigate to the summary mid-game and see incomplete or
zero minutes for all players still on the field.

The `end_game` endpoint closes every open slot with the final clock time,
then the frontend navigates to the summary. The tracker page detects a
finished game (no active slots) on load and shows "Final" instead of the
clock controls.

**Tradeoff:** Users can't view partial summaries mid-game from the summary
page. They can still see live stat counts on the tracker itself. Acceptable
— the summary is a post-game artifact.

**Interview framing:** *"The summary page is gated behind a Game Over action
that closes all open player slots. That ensures minutes-played calculations
are accurate. I made this a deliberate UX gate rather than trying to handle
partial data — the tracker shows live stats during the game, and the summary
is the clean post-game view."*

---

### Decision — Season stats as a dedicated endpoint, not client-side aggregation

**Why:** The Season Stats page needs every player's totals across all games.
Two options: (1) fetch every game's stats and aggregate in the browser, or
(2) add a single backend endpoint that does the aggregation in one query
pass.

I chose (2) — `/api/players/season_stats/`. The backend already has
`rollup_counts()` and `minutes_played()` helpers, so the endpoint reuses
them. The frontend gets a single request with the final numbers.

**Tradeoff:** One more backend endpoint. Saves N+1 requests on the
frontend (one per game) and keeps aggregation logic server-side where it's
testable and cacheable.

**Interview framing:** *"Season-wide stats are aggregated server-side in a
dedicated endpoint rather than fetched per-game and summed in the browser.
It reuses the existing rollup helpers, avoids N+1 client requests, and
keeps the aggregation logic in one testable place."*

---

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

### Decision — `@extend_schema` on custom actions

**Why:** drf-spectacular auto-generates correct schemas for standard
ModelViewSet CRUD operations, but custom `@action` endpoints that return
ad-hoc `Response({...})` dicts get the wrong schema — spectacular falls
back to the ViewSet's default serializer (e.g. `GameSerializer`) even when
the action returns a completely different shape. Adding `@extend_schema`
with `request=` and `responses=` tells spectacular the actual input and
output types.

This matters because the frontend TypeScript types are generated from the
schema. A wrong schema means the typed client lies about the shape of the
data, which defeats the entire point of the type generation pipeline.

**Tradeoff:** Adds a decorator per custom action. Worth it — the cost
is a few lines, and the alternative is untyped or mis-typed frontend code.

**Interview framing:** *"Custom DRF actions return freeform Response dicts
that the schema generator can't introspect. I added explicit schema
annotations so the generated TypeScript types match the real API contract.
The typed client is only useful if the schema it's built on is accurate —
otherwise you get a false sense of type safety."*

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

Django backend, REST API via DRF, React + Vite frontend with a typed client
generated from the OpenAPI schema. Django admin for development and ops.
SQLite locally, Postgres-ready for deploy. The frontend has five pages:
Games (CRUD), Game Setup (assign starting XI to a 4-3-3 formation), Live
Tracker (pitch diagram with stat buttons, game clock, substitution flow),
Game Summary (per-player stats table), and Season Stats (aggregated across
all games). The tracker uses optimistic updates with the stat rollup
hierarchy mirrored in the frontend. Clock persists to sessionStorage so
navigation doesn't reset it.

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
- **2026-04-15** — Added five frontend/UX decisions: FPL-inspired pitch
  layout (row-based flexbox over CSS grid), sessionStorage clock
  persistence, dual-layer stat rollup (backend + frontend optimistic
  updates), Game Over flow gating summary page, season stats as a
  dedicated backend endpoint.
- **2026-04-15** — Initial decision log created. Captures the five key
  model-layer decisions made during the schema design session:
  `DurationField` over `CharField`, stat rollup at read time, DB-layer
  uniqueness constraints, `move_player` helper, strict insert-or-delete
  on stat events.
- **2026-04-16** — Added feature decisions: position-aware stat display
  (GK vs field), per-position stat breakdown with expandable rows, game
  selector dropdown on Stats page.
- **2026-04-16** — Added deploy decisions: Vite 8→7 downgrade for Node
  compat, WhiteNoise static serving, Django catch-all for SPA, Railway
  SSL termination (no SECURE_SSL_REDIRECT). App deployed to
  stats.warriorgirlssc.com.
