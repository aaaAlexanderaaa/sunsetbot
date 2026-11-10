---
doc_type: evidence
status: current
authority: evidence
last_reconciled: 2026-11-10
---

# Public publication privacy review

The owner authorizes publication of the project, diagnostics and research
after personal sensitive information is removed. The review covers every
Git blob reachable from the branch being published, plus commit identities.
Local configuration, runtime observations and the pre-publication backup stay
under ignored `.env` and `var/` paths.

## Published changes

- Local machine paths use a generic checkout location.
- Research response metadata redacts private conversation/message identifiers;
  substantive question/answer text and public source receipts remain available.
- Public commits use the GitHub account's noreply identity, with the original
  local history preserved in a private backup. Content-bearing scientific
  source/input hashes retain their original scope.
- The refresh credential lives in `SUNSETBOT_REFRESH_KEY`, supplied through
  the process environment or ignored local `.env`. Docker build context and
  Git exclude that file; Compose passes the configured value at runtime.
- An empty refresh key returns HTTP 503 `REFRESH_KEY_UNCONFIGURED` before
  external effects. Configured-key authorization and scheduled acquisition
  retain their existing behavior.

The November 8 scheduled-cache HTTP/source receipt describes its original
private deployment; its original source hashes remain preserved as historical
evidence. Later credential loading is a separately tested implementation.
The frozen physics and empirical-study sources, predictions and parameter
identities remain unchanged by metadata redaction.

## Verification

All 95 Node checks pass, including actual HTTP rejection with an unconfigured
key, authorization with an explicit key, and acquisition isolation. The final
outgoing-history review verifies absence of the original private identifiers,
machine mailbox/path and refresh secret. Addresses and names already present
in downloaded public primary sources retain their source-attribution scope.
