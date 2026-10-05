\# ADR 018: Stack gate, Next.js chosen



Date: 2026-10-05. Status: Accepted.



\## Context

The assessment allows "Next.js or React + Node.js/Express". Before building,

I ran a time-boxed spike to prove the riskiest parts of a single-deployment

Next.js stack on the real platforms.



\## Evidence (all on https://apparelflow-erp.vercel.app)

\- A route handler returned JSON and queried Neon through the pooled connection.

\- Cookie login set an httpOnly cookie and a second route authenticated from it,

&#x20; reading the cookie from the Request header. No cookie or a forged token gave 401.

\- `await params` worked on Next.js 16.

\- A BEGIN / SELECT ... FOR UPDATE / COMMIT transaction on one checked-out

&#x20; connection made two parallel requests run one after the other (about 4.5s

&#x20; for two 2-second holds), and a thrown error rolled everything back.



\## Decision

Use Next.js (App Router route handlers) with PostgreSQL on Neon.

The Vite + Express fallback is not needed.



\## Costs and caveats

\- The spike overran its 2-hour limit (about 2h20m) because of setup waits and

&#x20; Vercel preview deployments being login-protected. Only the production URL is public.

\- The spike connected as the Neon owner role. The real app will use a

&#x20; least-privilege role (see D16 and D23).

\- Neon's free compute pauses when idle, so the first request after a quiet period

&#x20; is slower. This is noted in the README.

\- The PGlite capability check (D19) is not part of this decision. It follows

&#x20; separately, and any gap moves tests to the Neon lane.

