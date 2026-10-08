# ApparelFlow ERP: Cutting Gatekeeper & Sewing Queue

A full-stack implementation of the **Cutting Operations & Gatekeeper Verification Terminal** for Webtezza's ApparelFlow ERP (Software Engineering Intern practical challenge).

No cutting batch can reach the Sewing Queue unless a Cutting Verifier has counted every component and none is short. The rule is enforced defensively across the UI, API/service layer, and database itself.

* **Live app:** https://apparelflow-erp.vercel.app
* **Repository:** https://github.com/awatharushika44/apparelflow-erp
* **Architecture deep-dive:** [ARCHITECTURE.md](ARCHITECTURE.md)
* **AI usage report:** [AI_OPTIMIZATION_REPORT.md](AI_OPTIMIZATION_REPORT.md)

---

## Demo credentials

These are public demo accounts. The landing page has a one-click **Role Switcher** that fills them in for you.

| Role               | Email                         | Password       | Can do                                                             | Cannot do                                  |
| ------------------ | ----------------------------- | -------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| Cutting Supervisor | `supervisor@apparelflow.demo` | `Cutting@2026` | Create orders, log fabric, submit to QC, resubmit rejected batches | Verify batches, see the Sewing Queue       |
| Cutting Verifier   | `verifier@apparelflow.demo`   | `Verify@2026`  | Count pieces, see traffic lights, approve or reject                | Create orders, see the Sewing Queue        |
| Sewing Supervisor  | `sewing@apparelflow.demo`     | `Sewing@2026`  | View verified batches and audit notes, start sewing                | See pending, rejected or unverified orders |

### Five-minute evaluator walkthrough

1. Sign in as **Supervisor**, create an order (for example, Casual Blouse, 50 units), enter the fabric roll and actual fabric yards, then submit it to QC.
2. Sign in as **Verifier**, open the submitted order, and enter a short count for any component (for example, 98 of 100 sleeves). The row turns **RED** and **Approve batch** is disabled.
3. Try the API directly using the security checks below. The server returns **422** for the approval attempt.
4. Enter exact counts for every component. All rows turn **GREEN** (or **YELLOW** for surplus), and approval unlocks.
5. Sign in as **Sewing Supervisor**. The verified batch appears with verifier name, timestamp, variances and wastage. Click **Start Sewing**.
6. Refresh the browser. The state persists because it is stored in the database.

---

## Tech stack

| Layer      | Choice                                                                             |
| ---------- | ---------------------------------------------------------------------------------- |
| Framework  | Next.js (App Router) with route handlers, React 19                                 |
| Database   | PostgreSQL on Neon                                                                 |
| DB access  | Raw SQL via `pg`, behind a small adapter so tests can swap in PGlite               |
| Validation | Zod on the server, plus a pure `parseWholeNumber` helper for instant form feedback |
| Auth       | `bcryptjs` password hashes, JWT in an `httpOnly` cookie                            |
| Tests      | Vitest (PGlite, runs real migrations), Playwright + axe-core for accessibility     |
| Hosting    | Vercel (app), Neon (database)                                                      |

---

## Architecture

```text
Browser (React screens per role)
        |
        v
Route handlers  app/api/**/route.js
        |   withGuard(routeKey, handler) -> 401 / 403 from lib/permissions.js
        v
Services        lib/services/*   one transaction per action, row locks, 409 / 422
        |
        v
Domain          lib/domain/*     pure functions: multiplier, traffic light, wastage
        |
        v
PostgreSQL      CHECK constraints, triggers, least-privilege role
```

### Where the Hard Stop is enforced

| Layer     | What it does                                                                                                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI        | **Approve batch** is disabled while any component is RED or uncounted. This is convenience only.                                                                                               |
| API guard | Only `cutting_verifier` may call approve. Everyone else gets 401 or 403.                                                                                                                       |
| Service   | Locks the order row, recomputes every expected quantity and light **from stored data**, and returns **422 `HARD_STOP`** listing the blocking components.                                       |
| Database  | Trigger `check_hard_stop` refuses `PENDING_VERIFICATION -> VERIFIED` if any component row is missing, mismatched, RED or uncounted. Even a bug in app code cannot create a bad VERIFIED batch. |

### State machine

```text
CUTTING_IN_PROGRESS --submit--> PENDING_VERIFICATION --approve--> VERIFIED --start sewing--> SEWING_STARTED
                                       |    ^
                                  reject    | resubmit
                                       v    |
                                    REJECTED
```

Legal transitions live in the `allowed_transitions` table and are enforced by a trigger. Every other transition is refused.

### Traffic lights

| Light  | Rule              | Effect                                      |
| ------ | ----------------- | ------------------------------------------- |
| GREEN  | actual = expected | Counts as verified                          |
| YELLOW | actual > expected | Surplus is recorded; batch may proceed      |
| RED    | actual < expected | **Approval blocked** (UI, API and database) |

Expected quantity = target quantity × pieces per garment.

For example, 50 garments × 2 cuffs = 100 cuffs.

The server computes lights from stored counts; a status sent by the browser is never trusted.

### Fabric wastage

```text
Wastage % = ((actual yards - expected yards) / expected yards) × 100

expected yards = target quantity × standard yards per piece
```

Computed on the server using integer hundredths of a yard to avoid floating-point drift.

Going over the recipe's wastage cap is flagged. The verifier must acknowledge it in the UI, and the acknowledgement is stored in the audit log. It does **not** block approval because the brief's hard stop is component shortage or uncounted components.

---

## Database schema

| Table                 | Purpose                   | Key attributes                                                                                                                                            |
| --------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`               | Accounts                  | `email` (unique, lowercase), `password_hash`, `role` (enum), `full_name`                                                                                  |
| `recipes`             | Bill of materials header  | `recipe_code`, `name`, `category`, `std_fabric_yards`, `wastage_cap`                                                                                      |
| `recipe_components`   | Cut parts per recipe      | `recipe_id`, `component_name`, `pieces_per_garment`, `image_url`                                                                                          |
| `cutting_orders`      | Production batches        | `order_no` (`CO-0001`), `recipe_id`, `target_qty`, `fabric_roll_id`, `actual_fabric_yds`, `status`, `created_by`, `sewing_started_by/at`                  |
| `verification_items`  | Live counts per component | `order_id`, `component_id`, `expected_qty`, `actual_qty` (NULL = not counted), `status`                                                                   |
| `verification_logs`   | **Immutable audit trail** | `verifier_id`, `decision`, `rejection_note`, `audit_note`, `wastage_pct`, `expected_fabric_yds`, `items_snapshot` (per-component variances), `decided_at` |
| `allowed_transitions` | Legal state moves         | `from_status`, `to_status`                                                                                                                                |

### Database-level guarantees

* **Audit immutability:** `UPDATE`, `DELETE` and `TRUNCATE` on `verification_logs` are blocked by triggers, and the app role has `INSERT` only.
* **One approval per order:** partial unique index on `verification_logs (order_id) WHERE decision = 'APPROVED'`.
* **Rejection requires a reason:** `CHECK` constraint on non-blank `rejection_note`.
* **Role integrity:** only a `cutting_verifier` can sign a verification log; only a `cutting_supervisor` can create an order; only a `sewing_supervisor` can start sewing.
* **Least privilege:** the app connects as `apparelflow_app` with no `DELETE` or schema-change privileges. Migrations run as a separate owner role.
* **Frozen fields:** recipe and target quantity cannot change after submission.

Migrations are in `db/migrations/` (`001_schema`, `002_triggers`, `003_roles`, `004_hard_stop`).

---

## Seeded data

`npm run db:seed` creates the three demo users, the two recipes from the brief, and eight demo orders that walk through the workflow states. The deployed database was seeded and then used during my own testing, so it also contains additional state changes and test orders.

### Recipes

| Recipe        | Code       | Std fabric | Wastage cap | Components (pieces per garment)                                                           |
| ------------- | ---------- | ---------: | ----------: | ----------------------------------------------------------------------------------------- |
| Casual Blouse | `REC-BL01` |    1.8 yds |        5.0% | Front Body 1, Back Body 1, Sleeves L&R 2, Collar & Stand 1, Sleeve Cuffs 2                |
| Crop Top      | `REC-CT02` |    1.1 yds |        8.0% | Front Chest 1, Back Support 1, Neck Binding 1, Hem Elastic Casing 1, Side Strap Accents 2 |

### Demo orders on the deployed site

| Order             | State                    | What it demonstrates                                |
| ----------------- | ------------------------ | --------------------------------------------------- |
| CO-0001           | Cutting in progress      | Supervisor can still edit and submit it             |
| CO-0002           | Pending verification     | Not yet counted                                     |
| CO-0003           | Pending verification     | Sleeves short, so the RED hard stop blocks approval |
| CO-0004           | Pending verification     | Not yet counted                                     |
| CO-0005 / CO-0008 | Verified                 | Waiting in the Sewing Queue                         |
| CO-0006           | Rejected and resubmitted | Rejection reason remains in the audit history       |
| CO-0007           | Sewing started           | Already released to the assembly floor              |
| CO-0009           | Test order               | Retained test order for the over-cap wastage path   |

CO-0001 to CO-0008 come from the seed. CO-0009 and the resubmission of CO-0006 happened during testing on the deployed site, so a freshly seeded database will look slightly different. Order numbers come from a database sequence.

---

## API reference

Every protected route is declared in `lib/permissions.js`. A test fails if a route is missing from the permissions map or if the map contains an invalid route entry.

| Endpoint                                     | Roles                | Notes                                                   |
| -------------------------------------------- | -------------------- | ------------------------------------------------------- |
| `GET /api/health`                            | public               | Liveness                                                |
| `POST /api/auth/login`                       | public               | Sets `httpOnly` cookie                                  |
| `POST /api/auth/logout`                      | any signed-in user   |                                                         |
| `GET /api/auth/me`                           | any signed-in user   | Current user and role                                   |
| `GET /api/recipes`                           | supervisor, verifier | Recipes and components                                  |
| `GET /api/orders`                            | supervisor           | Cutting orders with their status                        |
| `POST /api/orders`                           | supervisor           | Creates `CUTTING_IN_PROGRESS`; 422 on invalid input     |
| `POST /api/orders/[id]/submit`               | supervisor           | Moves to `PENDING_VERIFICATION`, creates component rows |
| `POST /api/orders/[id]/resubmit`             | supervisor           | `REJECTED` back to pending, resets counts               |
| `GET /api/verification/orders`               | verifier             | Pending orders                                          |
| `GET /api/verification/orders/[id]`          | verifier             | Detail with lights                                      |
| `PUT /api/verification/orders/[id]/counts`   | verifier             | Save counts; lights computed server-side                |
| `POST /api/verification/orders/[id]/approve` | verifier             | **422** if any RED, missing or uncounted                |
| `POST /api/verification/orders/[id]/reject`  | verifier             | Mandatory reason note                                   |
| `GET /api/sewing/queue`                      | sewing               | Fixed `WHERE status = 'VERIFIED'`                       |
| `GET /api/sewing/active`                     | sewing               | `SEWING_STARTED` orders                                 |
| `GET /api/sewing/orders/[id]`                | sewing               | Only VERIFIED or SEWING_STARTED, otherwise 404          |
| `POST /api/sewing/orders/[id]/start`         | sewing               | `VERIFIED` to `SEWING_STARTED`                          |

Status codes used consistently:

* **401** — not signed in
* **403** — wrong role or forbidden request
* **404** — not found
* **409** — illegal state transition
* **415** — unsupported content type
* **422** — validation or hard-stop failure

---

## Security checks

You can verify these with cURL or Postman. Set the live URL first:

```bash
BASE=https://apparelflow-erp.vercel.app
```

### 1. Log in as the supervisor

```bash
curl -i -c jar.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"supervisor@apparelflow.demo","password":"Cutting@2026"}'
```

### 2. Supervisor tries to approve a batch

```bash
curl -i -b jar.txt -X POST "$BASE/api/verification/orders/1/approve" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected result:

```text
403 Forbidden
```

### 3. Supervisor tries to read the Sewing Queue

```bash
curl -i -b jar.txt "$BASE/api/sewing/queue"
```

Expected result:

```text
403 Forbidden
```

Signed in as the verifier, approving an order with any RED or uncounted component returns **422** with a `blockers` list.

### Server-side security guarantees

* **Server-side RBAC** on every protected route, from one permissions map.
* **Server-side hard stop** recomputes from stored data and ignores client-sent statuses.
* **Query isolation:** the queue SQL is fixed to `status = 'VERIFIED'`; query parameters are never interpolated.
* **Authenticated context:** verifier ID and timestamps come from the session and database clock.
* Forged `verifier`, `status`, `decision` or timestamp fields in the request body are not trusted.
* **Role is read from the database** on each request rather than trusted solely from the JWT.
* **CSRF hardening:** cross-origin mutating requests are refused, and mutating requests must use `application/json`.
* **Concurrency:** approve, reject, count-saving and start-sewing lock the order row using `SELECT ... FOR UPDATE`, so competing requests cannot both successfully change the same state.

---

## Input validation and accessibility

* Order and count inputs accept **whole numbers only**.
* Negatives, decimals, non-numeric text and empty values are rejected with inline errors on the client and again by Zod on the server.
* Colours are defined as foreground/background pairs in `app/tokens.css`.
* `tests/contrast.test.js` checks the defined colour pairs against WCAG contrast ratios.
* `e2e/axe.spec.js` runs axe-core accessibility checks on each screen.
* Inputs use dark text on light backgrounds in every state, including default, focus, error, dropdown, disabled and autofill states.
* The theme is locked to light so dark-mode overrides cannot introduce unintended contrast failures.

---

## Automated tests

```bash
npm test
```

The suite contains **179 tests across 15 files**, running against an in-process PGlite database that loads the real migrations. No external database or secrets are required for the normal test suite.

| Requirement                                     | Test file                                       | Coverage                               |
| ----------------------------------------------- | ----------------------------------------------- | -------------------------------------- |
| Test 1: all-GREEN order approved by verifier    | `tests/approve.test.js`                         | T1                                     |
| Test 2: RED component blocks approval           | `tests/approve.test.js`                         | T2 — 422, nothing written              |
| Test 3: rejection without a note refused        | `tests/reject.test.js`                          | T3 — 422, nothing changes              |
| Test 4: non-verifier roles get 403              | `tests/approve.test.js`, `tests/reject.test.js` | T4                                     |
| Test 5: unapproved orders never appear in queue | `tests/sewing.test.js`                          | T5, including hostile query parameters |

Also covered:

* authentication and forged tokens
* multiplier engine
* traffic-light boundaries
* exact wastage mathematics
* database hard-stop triggers
* rollback behaviour
* double approval returning 409
* permissions coverage
* WCAG contrast
* invalid inputs
* immutable audit logs
* sewing queue isolation

### Additional checks

```bash
npm run test:e2e
npm run audit:db
BASE_URL=https://apparelflow-erp.vercel.app npm run audit:live
```

* `npm run test:e2e` — Playwright + axe accessibility scan.
* `npm run audit:db` — database privilege and trigger audit; requires the configured database environment.
* `BASE_URL=https://apparelflow-erp.vercel.app npm run audit:live` — read-only hostile-request audit against the deployed production site.

---

## Running locally

**Requirements:** Node.js 20+ and a PostgreSQL database. A free Neon project can be used.

```bash
git clone https://github.com/awatharushika44/apparelflow-erp.git
cd apparelflow-erp
npm install
```

Create `.env.local`:

```env
# Runtime connection: the least-privilege application role
DATABASE_URL="postgres://apparelflow_app:<password>@<host>/<db>?sslmode=require"

# Migrations and seeding only: the owner role.
# Never deploy this to the application runtime.
DATABASE_URL_ADMIN="postgres://<owner>:<password>@<host>/<db>?sslmode=require"

# At least 32 characters
JWT_SECRET="<long random string>"
```

Set the `apparelflow_app` role's password in the database. Migration `003` creates the role without storing a password in the repository.

Then:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

The local application runs at:

```text
http://localhost:3000
```

---

## Deploying to Vercel

1. Import the GitHub repository into Vercel.
2. Add `DATABASE_URL` and `JWT_SECRET` as environment variables.
3. Do **not** add `DATABASE_URL_ADMIN` to the deployed application.
4. Run `db:migrate` and `db:seed` once from a controlled environment against the production database.
5. Deploy.
6. Verify `GET /api/health` returns OK.
7. Run the production audit:

```bash
BASE_URL=https://apparelflow-erp.vercel.app npm run audit:live
```

---

## Project structure

```text
app/
  api/                  Route handlers (auth, recipes, orders, verification, sewing, health)
  components/           Role screens: SupervisorScreen, VerifierScreen, SewingScreen, Gate
  components/landing/   Landing page and Role Switcher / sign-in dialog
  *.css, tokens.css     Styles; colours are stored as contrast-checked tokens

lib/
  permissions.js        Single source of truth for route access
  guard.js              withGuard(): auth, role and CSRF checks
  auth/session.js       JWT cookie handling
  services/             One transaction per business action
  domain/               Pure logic: multiplier, trafficLight, wastage
  validation/           Zod schemas and whole-number parser

db/
  migrations/           001 schema, 002 triggers, 003 roles, 004 hard stop
  seed.mjs
  demo-data.mjs

tests/                   Vitest suite (PGlite)
e2e/                     Playwright + axe accessibility spec
scripts/                 Attack and audit scripts
docs/adr/                Architecture decision records
```

---

## Design decisions worth knowing

* **Defence in depth.** The hard stop lives in the UI, service/API layer and database. A bug in one layer does not let a short batch through.
* **Audit rows are append-only.** The verifier ID, decision, wastage and per-component variance snapshot are written as part of the verification transaction and travel with the batch into the Sewing Queue.
* **Exact arithmetic.** Fabric is handled as integer hundredths of a yard and compared before rounding, so the over-cap flag does not depend on a rounded percentage.
* **Everything is transactional.** Each business action runs on one database connection with a row lock, so double-clicks and competing requests cannot produce two successful outcomes.
* **Role separation is enforced server-side.** UI visibility is not treated as a security boundary.

---

## AI usage

AI tools were used during development. The project records cases where AI-generated suggestions were incorrect and had to be fixed, rather than treating generated code as automatically correct.

See [AI_OPTIMIZATION_REPORT.md](AI_OPTIMIZATION_REPORT.md) for the detailed AI usage and review report.

---
