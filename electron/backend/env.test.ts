import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("parses comments, whitespace, quoted values, and values containing equals signs", () => {
    expect(
      parseEnv(`
        # ignored
        OPENAI_API_KEY = "sk-test=value"
        DOOR_TOKEN_PATH='C:/secret/path'
        EMPTY=
        NO_SEPARATOR
      `)
    ).toEqual({
      OPENAI_API_KEY: "sk-test=value",
      DOOR_TOKEN_PATH: "C:/secret/path",
      EMPTY: ""
    });
  });
});
