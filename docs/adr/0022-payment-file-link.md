# 0022. Linking corrected addresses into payment files

- Status: accepted (2026-11-20, Approval 2)

## Context
The core journey needs approved master-list addresses to reach the pain.001 being pre-flighted.

## Decision
A PaymentFileLink matches each payment-file party to a master-list record by IBAN or account number plus a normalised name. Exactly one match → linked; several or none → review. Only approved or edited records are applied. The link is recorded and audited.

## Alternatives considered
Matching by name only (ambiguous); re-structuring payment-file addresses independently (duplicates review work).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
