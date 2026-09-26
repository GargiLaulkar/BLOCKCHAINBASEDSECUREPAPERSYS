# SIGIL CR-01–CR-12 — fixed package

This version updates the TypeScript/WebCrypto compatibility issues and removes the old CR-01 scaffold assertions that expected implemented functions to throw `CR-02`/`CR-03` errors.

## What was fixed

- `src/canonical.ts`: compatible `canonicalize` import handling for the package's CommonJS export shape.
- `src/draft.ts`: WebCrypto inputs are copied to real `ArrayBuffer` values, avoiding the TypeScript 5.6+ `ArrayBufferLike`/`BufferSource` errors.
- `src/envelope.ts`: same WebCrypto `ArrayBuffer` compatibility fix for ECDH, HKDF and AES-GCM.
- `src/keystore.ts`: same WebCrypto compatibility fix for PBKDF2, HKDF and AES-GCM.
- `src/shares.ts`: same WebCrypto compatibility fix for raw public-key import.
- `src/matcher.ts`: Kendall agreement now supports both string and numeric arrays.
- `test/smoke.test.ts`: updated to test the implemented CR behavior instead of expecting old scaffold stubs to throw.

## Run on Windows PowerShell

From `packages/core`:

```powershell
npm install
npm run typecheck
npm test
npm run build
```

If `npm run typecheck` and `npm test` pass, the package is ready for the next project step.
