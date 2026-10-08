# AI Optimization Report

An honest account of how AI was used on ApparelFlow ERP, what it got wrong, and what I changed.

## 1. Tools & Prompting

| Tool | Used for |
|---|---|
| Claude (chat) | Reading the PDF, architecture and decision records, schema and migrations, services and route handlers, Vitest tests, UI components and CSS |
| ChatGPT | Git and terminal walkthroughs, some tests |

**Prompting approach.** I first read the assessment PDF myself and made sure I understood the problem, the roles, the state machine and the hard-stop rule before I opened any AI tool. Then I wrote prompts describing what I wanted to build, and often asked for the result to be improved with prompts. The PDF stayed the source of truth. Work went in small steps, each with a goal, a "try to break it" check and an atomic commit. I also asked for each concept to be explained before the code was written, so I could explain the code myself.

## 2. Flawed / Broken AI Code

**2.1 The database trigger let a short batch through (security gap).**
AI-written migration 002 only checked that an APPROVED log existed before an order could become VERIFIED. It never checked the counts, so a batch with a RED component could still reach VERIFIED. I caught it by reading my own test output, which showed a count saved as 98 of 100 (RED) followed by "allowed: PENDING to VERIFIED". Fix: migration `004_hard_stop.sql` now requires every component row to exist, expected quantity to equal recipe x target, and nothing to be RED or uncounted. Evidence: `hard-stop-attacks` (11 PASS) and `tests/db-hard-stop.test.js`.

**2.2 A test helper was bent so a different test could pass.**
To let the sewing test build a VERIFIED order, an AI edit made `tryVerify` in `tests/helpers/fixtures.js` overwrite every count with the expected quantity and set it GREEN. That silently emptied the two database hard-stop tests. They failed with "promise resolved instead of rejecting". Single-file runs hid it. I found it by running the full suite and reading the diff. Fix: I removed the override (commit `e4a2fec`) and rebuilt the sewing tests to create orders through the real create, submit, count and approve endpoints.

**2.3 A test assumed data that was never created.**
The first sewing test used `verifiedOrderId`, expecting the harness to provide a VERIFIED order. It was `undefined`, so five tests failed with 404 and looked like API bugs. The API was fine; the test setup was wrong.

**2.4 A false claim about floating point.**
The AI wrote in the architecture notes that `1.1 * 40` produces a float error. In Node it equals exactly 44. My own test failed on it, and I corrected the document to use `0.1 + 0.2` and `1.1 * 3`. The decision to use integer maths was still right, but the example had been invented.

**2.5 A leftover prototype login.**
The stack-gate spike had a login with a hard-coded password that signed a cookie with my real JWT secret as user 1, who is the seeded supervisor. Once real auth shipped, that would have been a bypass. I deleted the routes (commit `480c5c8`), dropped the spike table, rotated `JWT_SECRET`, and confirmed the old URLs return 404.

**2.6 Tests and design tokens drifting apart.**
The AI renamed colour pairs in `tokens.css` but left the old names in the "required pairs" list of the contrast test, so `npm test` failed on `pair-tab`. The test caught the mismatch and I synchronised the list.

**2.7 An over-claimed verification.**
The AI said my break-it check "proved" that the order stayed PENDING with no log row saved. My output showed the tests had failed at the 422 assertion before reaching those checks, so it only proved the database trigger fired. I did not accept the claim and asked for a proper rollback test.

## 3. Human Refactoring

- **Exact wastage maths.** Fabric is calculated in integer hundredths of a yard. "Over the cap" is decided on exact integers, never on the rounded display value. A test covers 5.00% versus 5.01%.
- **Recompute, never trust.** Approve recomputes every traffic light from stored counts inside one transaction with `SELECT ... FOR UPDATE`. The stored status column and any client-sent status are ignored.
- **Identity from the session only.** `verifier_id` and `decided_at` come from the cookie and the database clock. A test sends forged `verifierId`, `status`, `decision` and `decidedAt` values in the body and shows they are ignored.
- **Least-privilege database role.** The app connects as `apparelflow_app`, which cannot UPDATE, DELETE or TRUNCATE the audit log. The owner connection string is not deployed.
- **One permissions map.** `lib/permissions.js` drives the guard, and a coverage test fails if any route is missing from it.
- **404, not 403, for sewing.** Sewing gets 404 for orders it may not see, so it does not confirm they exist. The queue SQL is fixed text with no parameters.
- **One shared input rule.** Whole-number checks live in one pure function with tests and give instant feedback. The server's Zod schemas are the real boundary.
- **Contrast as a build gate.** Every colour is a named foreground/background pair in `tokens.css`. A test computes the WCAG ratio for each pair and fails if a raw colour appears in any other stylesheet. axe runs on every screen in a real browser.
- **Learned from a weak break-it test.** Changing the queue to include PENDING orders still passed, because the INNER JOIN on an APPROVED log hid the mistake. I now treat the SQL filter and the join as two separate protections and test the filter directly.

## 4. Defensive Architecture

Every request passes the same layers. The UI only hides things; it never forbids them.

1. **Origin and content-type check** on mutating requests (403, 415).
2. **Authenticate** the httpOnly cookie, then load the user from the database, so the role is never read from the token (401).
3. **Authorize** by the permissions map (403).
4. **Zod validation** (422), including negatives, decimals, empty and non-numeric values.
5. **Service in one transaction** with a row lock: a state check (409), then business rules such as a RED, uncounted or missing component (422).
6. **Database:** foreign keys, CHECKs, enums, a transition trigger backed by the `allowed_transitions` table, the hard-stop trigger from migration 004, and immutable audit-log triggers.

**No status override is possible.** There is no generic "set status" endpoint, only verbs: submit, approve, reject, resubmit and start. Each verb checks the current state, and the database refuses any move that is not in `allowed_transitions`. The sewing queue is `WHERE status = 'VERIFIED'` in SQL, and `SEWING_STARTED` is a separate status so that filter can stay literal.

**Known limits.** JWTs cannot be revoked before the 8-hour expiry. The database owner can disable triggers. Double-approve is tested sequentially and backed by a row lock and a unique index, but I did not run a truly concurrent race test.
