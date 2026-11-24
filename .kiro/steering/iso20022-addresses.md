---
inclusion: fileMatch
fileMatchPattern: ["packages/core/**", "packages/rulepacks/**"]
---

# ISO 20022 address rules

## PostalAddress24 elements

| Element | Max length |
|---|---|
| StrtNm | 70 |
| BldgNb | 16 |
| BldgNm | 35 |
| Flr | 70 |
| PstBx | 16 |
| Room | 70 |
| PstCd | 16 |
| TwnNm | 35 |
| TwnLctnNm | 35 |
| DstrctNm | 35 |
| CtrySubDvsn | 35 |
| Ctry | 2 |
| AdrLine | 70 (0..7 occurrences) |

- `Ctry` is an ISO 3166-1 alpha-2 code.

## Message version to address type
| Message version | Address type |
|---|---|
| pain.001.001.03 | PostalAddress6 |
| pain.001.001.09 | PostalAddress24 |
| pain.001.001.12 | PostalAddress27 |

- PostalAddress6 (.03) lacks six elements: BldgNm, Flr, PstBx, Room, TwnLctnNm, DstrctNm.
- State no PostalAddress27 length unless a source gives it.

## Element map (ADR 0009)
- A per-message-version element map decides where a value can go.
- A value whose element does not exist in the target version goes to `AdrLine` in hybrid form if the pack allows it.
- Otherwise it becomes a finding.

## Hybrid form
- `TwnNm` and `Ctry` are mandatory.
- At most 2 `AdrLine`.
- No duplicated content between `AdrLine` and the structured elements.

## Length
- Never truncate. Over-length is a finding.

## XML
- Edit XML by byte splice of `PstlAdr` ranges only.
- Reject input that contains `<!DOCTYPE`.

Sources: [PROJECT.md](../../PROJECT.md), [ADR 0009](../../docs/adr/0009-rule-packs.md)
