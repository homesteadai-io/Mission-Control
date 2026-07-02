import fs from "node:fs";
import path from "node:path";

const ENV_FILE = ".env.local";

export function readOpenAiApiKey(projectRoot: string) {
  const envPath = path.join(projectRoot, ENV_FILE);
  if (!fs.existsSync(envPath)) {
    throw new Error(`${ENV_FILE} is missing OPENAI_API_KEY`);
  }

  const envText = fs.readFileSync(envPath, "utf8");
  const parsed = parseEnv(envText);
  const apiKey = parsed.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(`${ENV_FILE} is missing OPENAI_API_KEY`);
  }

  return apiKey;
}

export function parseEnv(envText: string) {
  const values: Record<string, string> = {};

  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!key) continue;

    values[key] = unquoteEnvValue(rawValue);
  }

  return values;
}

function unquoteEnvValue(value: string) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('\\"', '"');
  }

  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}
