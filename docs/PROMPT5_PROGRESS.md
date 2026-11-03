# PROMPT5_PROGRESS.md (Member 4 takeover)

Created: 2026-11-03
Branch: member4/design-system
Base commit seen: 0b92def

## STEP A: Real state before touching anything
- [x] 1a. git status, git log --oneline -12, git diff --stat; identify commits/uncommitted since 0b92def (done - committed previous work as WIP FA-11)
- [x] 1b. Inspect uncommitted changes; if coherent + pass typecheck -> commit as "WIP FA-11: recover previous agent work"; if broken/half-written -> fix/finish (committed)
- [x] 2. Check existence: docs/PROMPT5_PROGRESS.md (created), docs/AUDIT_MEMBER4.md (exists), docs/PRE_PUSH_CHECKLIST.md (exists), docs/report/ (exists), axe test/script (verify-gallery-responsive.mjs uses axe-core), CSP in prod build (vite.config.ts has CSP), cleanup of old screenshots (to do - 29 superseded non-prefixed files found)
- [x] 3. pnpm install done; baseline: ui typecheck ok, frontend typecheck ok, ui tests 5/5, frontend tests 171/171, core tests 17/17, frontend build ok
- [ ] 4. List ambiguities with assumed answers, continue only with what's missing

## PART 1: Design match
- [ ] Compare every owned page at 1280px and 390px against UI_REFERENCE.md using scripts/verify-gallery-responsive.mjs approach (real headless Chrome): shell and guards, Admin participants, docket, Create Exam wizard, Key Ceremony, command centre, Setter assignments and composer, Holder assignments and console, gallery. List every mismatch. Fix them. (Screenshots exist as desktop/mobile sets from previous runs; will re-run after fixes.)

## PART 2: FA-11 accessibility and quality
- [ ] 1. Add axe-core as dev dependency to frontend only if missing. Run axe against every page and every state in /dev/gallery in real headless Chrome at both widths. Fix violations.
- [ ] 2. Keyboard navigation, focus rings, traps, Escape, focus return. Fix.
- [ ] 3. Reduced motion - disable seal-break and transitions.
- [ ] 4. Contrast WCAG 2.2 AA for all text/background including disabled/dimmed Coupon buttons and reason text.
- [ ] 5. No layout shift on load - skeletons match final layout.
- [ ] 6. Strict CSP in PRODUCTION build only. Document policy and connect-src env in docs/HANDOFF.md.
- [ ] 7. Security scan - no dangerous patterns, report/fix.
- [ ] 8. States review - empty/loading/error/permission denied/in-flight/failed for all pages, add tests.
- [ ] 9. Writing rules 10.9 - fix violations.
- [ ] 10. Plaintext share note in docs/HANDOFF.md.

## PART 3: Completion audit
- [ ] FA-01 to FA-11 against Done when and section 18, write table in docs/AUDIT_MEMBER4.md, fix gaps.
- [ ] Check FA-09/FA-10 coverage, add missing tests.

## PART 4: Cleanup and documentation
- [ ] 1. Clean superseded screenshots, separate commit "chore: remove superseded 520px screenshots".
- [ ] 2. Write report chapter in docs/report/.
- [ ] 3. Write docs/PRE_PUSH_CHECKLIST.md.
- [ ] 4. Final update docs/PROGRESS.md, clean docs/HANDOFF.md.

## FINAL VERIFICATION
- [ ] All tests/typecheck/build pass as specified.
- [ ] Responsive and axe checks zero violations.
- [ ] Commit locally, no push.
- [ ] Final table.
