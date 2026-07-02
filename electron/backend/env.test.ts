import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseEnv, readOpenAiApiKey } from "./env";

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

describe("readOpenAiApiKey", () => {
  let projectRoot: string;
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-env-test-"));
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("prefers process.env over any env file", () => {
    process.env.OPENAI_API_KEY = "from-process-env";
    fs.writeFileSync(path.join(projectRoot, ".env.local"), "OPENAI_API_KEY=from-env-local");

    expect(readOpenAiApiKey(projectRoot)).toBe("from-process-env");
  });

  it("falls back to .env.local when process.env is unset", () => {
    fs.writeFileSync(path.join(projectRoot, ".env.local"), "OPENAI_API_KEY=from-env-local");
    fs.writeFileSync(path.join(projectRoot, ".env"), "OPENAI_API_KEY=from-env");

    expect(readOpenAiApiKey(projectRoot)).toBe("from-env-local");
  });

  it("falls back to .env when process.env and .env.local are unset", () => {
    fs.writeFileSync(path.join(projectRoot, ".env"), "OPENAI_API_KEY=from-env");

    expect(readOpenAiApiKey(projectRoot)).toBe("from-env");
  });

  it("throws when no source has a key", () => {
    expect(() => readOpenAiApiKey(projectRoot)).toThrow(/OPENAI_API_KEY not found/);
  });
});
