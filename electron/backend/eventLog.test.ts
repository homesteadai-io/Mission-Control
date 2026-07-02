import { describe, expect, it } from "vitest";
import { assertSafeSessionId } from "./eventLog";

describe("assertSafeSessionId", () => {
  it("accepts bounded alphanumeric, underscore, and hyphen ids", () => {
    expect(() => assertSafeSessionId("mc_12345678-safe")).not.toThrow();
  });

  it("rejects traversal and short ids", () => {
    expect(() => assertSafeSessionId("../secrets")).toThrow("Invalid transcript session id");
    expect(() => assertSafeSessionId("short")).toThrow("Invalid transcript session id");
  });
});
