import fs from "node:fs";
import path from "node:path";

const ENV_FILES = [".env.local", ".env"];

export function readOpenAiApiKey(projectRoot: string) {
  const fromProcessEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromProcessEnv) return fromProcessEnv;

  for (const fileName of ENV_FILES) {
    const envPath = path.join(projectRoot, fileName);
    if (!fs.existsSync(envPath)) continue;

    const envText = fs.readFileSync(envPath, "utf8");
    const apiKey = parseEnv(envText).OPENAI_API_KEY?.trim();
    if (apiKey) return apiKey;
  }

  throw new Error(
    `OPENAI_API_KEY not found in process.env, ${ENV_FILES.join(", ")} under ${projectRoot}`
  );
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
