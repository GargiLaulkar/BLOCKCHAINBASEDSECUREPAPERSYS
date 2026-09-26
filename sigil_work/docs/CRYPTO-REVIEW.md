# Member 2 Crypto Review

## Scope

Review of the `@sigil/core` implementation against sections 6 and 9 of the SIGIL master specification.

## Controls checked

- WebCrypto is used for P-256 ECDH, HKDF-SHA256, PBKDF2-HMAC-SHA256 and AES-256-GCM.
- Keccak commitments and hashes use `ethers` v6.
- Threshold splitting uses the specified `shamir-secret-sharing` package rather than custom secret-sharing code.
- Envelope AAD binds exam ID, purpose and context.
- Envelope format is versioned and includes the 65-byte uncompressed ephemeral public key, 12-byte IV and authenticated ciphertext/tag.
- Holder keystores use PBKDF2 with 600,000 iterations, a 16-byte random salt and AES-256-GCM.
- Deterministic reveals use HKDF-SHA256 with the specified exam-ID salt and info string.
- Paper selection and centre variants use the specified Keccak-based Fisher-Yates construction.
- Variant hashes use canonical JSON before Keccak.
- Leak matching normalises Unicode NFKC and applies the specified 3-gram threshold and scoring formula.
- Draft encryption uses PBKDF2 and AES-GCM and keeps plaintext out of the encrypted payload.
- No application secret or private key is written to logs by the core implementation.

## Review limitation

This is a source-level Member 2 review. Integration with the other members' live frontend/backend/contract code must be reviewed again after those consumers import the final core package. Interface changes remain subject to the project's ICR process.
