import fc from "fast-check";
import { describe, it } from "vitest";

// Smoke property: proves fast-check runs inside the core's vitest project. Real properties
// (never invent, never truncate) arrive with the structuring tickets.
describe("fast-check smoke", () => {
  it("string concatenation preserves code-unit length", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => (a + b).length === a.length + b.length),
    );
  });
});
