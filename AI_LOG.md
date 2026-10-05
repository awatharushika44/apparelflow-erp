# AI Log

Only real mistakes made by AI suggestions that we actually hit and fixed.

## 1. Trigger let a RED batch reach VERIFIED (security gap)
AI-written migration 002 only checked that an APPROVED log existed before an
order could become VERIFIED. It never checked the counts. I caught it by
reading my own test output: "allowed: save a count (98 of 100 = RED)"
followed by "allowed: PENDING -> VERIFIED (log exists)".
Fix: 004_hard_stop.sql checks that every component row exists, that
expected = recipe x target, and that nothing is RED or uncounted.
Evidence: hard-stop-attacks.mjs, 11 PASS.