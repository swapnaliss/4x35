# 0010. XML editing by byte splice

- Status: accepted (2026-11-20, Approval 2)

## Context
Round-trip fidelity: a payment file must change only where addresses change.

## Decision
A position-reporting SAX parser finds each `PstlAdr` element's byte range; the writer splices new address XML into those ranges only. A property test proves bytes outside spliced ranges are unchanged. `ds:Signature` is detected and the user is warned that the signature is invalidated and offered a new MsgId. XSD validation with `xmllint-wasm` (no network) against pain.001 XSDs fetched at build time unless their licence allows committing them (M0-04). `<!DOCTYPE` is rejected.

## Alternatives considered
DOM round-trip with xmldom or fast-xml-parser (reorders attributes, loses formatting); libxmljs2 (unmaintained native module).

## Consequences
Cost to reverse: Medium. See [architecture](../architecture.md).
