import { describe, expect, it } from "vitest";
import { sanitizeDetail } from "./eventSanitizer";

describe("sanitizeDetail", () => {
  it("removes secret-shaped keys and keeps primitive values only", () => {
    expect(
      sanitizeDetail({
        status: 401,
        ok: false,
        note: "failed",
        apiKey: "sk-nope",
        client_secret: "ek-nope",
        tokenValue: "tok-nope",
        nested: { leak: true },
        list: ["nope"]
      })
    ).toEqual({
      status: 401,
      ok: false,
      note: "failed",
      nested: null,
      list: null
    });
  });

  it("returns undefined when there is no detail object", () => {
    expect(sanitizeDetail(undefined)).toBeUndefined();
  });
});
