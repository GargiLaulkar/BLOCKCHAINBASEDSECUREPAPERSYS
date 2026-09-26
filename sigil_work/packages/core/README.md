# @sigil/core — Member 2

This package contains SIGIL's shared cryptography, paper-selection, variant, schema, draft-encryption and leak-matching logic.

## Member 2 tasks

- CR-01: package scaffold
- CR-02: canonical JSON and Keccak
- CR-03: P-256 ECDH/HKDF/AES-GCM envelope
- CR-04: Shamir sharing and commitments
- CR-05: holder keystore and deterministic reveal
- CR-06: exam key ceremony
- CR-07: deterministic paper selection and centre variants
- CR-08: Zod schemas
- CR-09: leak matcher
- CR-10: encrypted local drafts
- CR-11: performance/browser checks
- CR-12: crypto review notes

## Verify locally

From the package directory:

```text
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm verify:browser
```

The implementation deliberately uses the cryptographic primitives required by the SIGIL specification. Do not run the browser crypto paths from an insecure LAN origin; use `localhost` or HTTPS.
