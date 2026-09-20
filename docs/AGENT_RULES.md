# Agent rules (apply to every session)

1. The file docs/SIGIL_Master_Project_Document.md is the specification. It overrides your own assumptions.
2. I am Member 1 (smart contracts, later integration and QA lead). Work only inside contracts/, packages/contracts-types/, docs/, and CI config. Do not create backend, frontend or core-package code.
3. Do only the task IDs I name. Before coding, write a short plan and list any ambiguities with your assumed answers. Wait for my approval only if an ambiguity changes an interface.
4. Never change a function name, parameter, event or error listed in section 7 of the spec without telling me first. Purely additive items (for example an ExamNotFound error or extra view functions) are allowed, but list each one in docs/contract-spec-changes.md.
5. No dummy or hard-coded sample data in contracts or scripts, except test fixtures inside test files.
6. Every task needs tests. Run them and show me the real output. Do not claim a test passes unless you ran it.
7. Solidity: version 0.8.24 or later, OpenZeppelin v5 AccessControl, custom errors (no revert strings), NatSpec comments on every external function, no delegatecall, no selfdestruct, no upgradeability.
8. If a library API differs from what the spec assumes, check the installed version's docs or source, tell me, and adapt.
9. After each finished task: run the full test suite, update docs/PROGRESS.md (task ID, status), and give me a suggested commit message in the form "SC-0X: what changed".
10. End every reply with: files created or changed, the command to run the tests, and what remains.
