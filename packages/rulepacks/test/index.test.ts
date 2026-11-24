import { describe, expect, it } from "vitest";
import { WORKSPACE } from "../src/index.js";

describe("@4x35/rulepacks", () => {
  it("is wired into the workspace build and test run", () => {
    expect(WORKSPACE).toBe("@4x35/rulepacks");
  });
});
