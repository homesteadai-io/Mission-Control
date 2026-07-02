import { randomUUID } from "node:crypto";
import { readOpenAiApiKey } from "./env.js";
import { appendEvent } from "./eventLog.js";

export const REALTIME_MODEL = "gpt-realtime-2";
export const MISSION_CONTROL_INSTRUCTIONS =
  "You are Mission Control, the voice cockpit for Homestead, a private AI operating system. Be concise and operational. Render anything visual or longer than two sentences as an artifact instead of reading it aloud. Announce tool use in a few words while executing. Never claim an action succeeded without the tool result.";

export interface MintRealtimeSecretOptions {
  stateSummary?: string;
}

export interface MintedRealtimeSecret {
  sessionId: string;
  clientSecret: string;
  expiresAt?: number;
  model: typeof REALTIME_MODEL;
  instructions: string;
}

export async function mintRealtimeClientSecret(projectRoot: string, options: MintRealtimeSecretOptions = {}) {
  const apiKey = readOpenAiApiKey(projectRoot);
  const sessionId = `mc_${randomUUID().replaceAll("-", "")}`;
  const instructions = buildMissionInstructions(options.stateSummary);

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "mission-control-local-operator"
    },
    body: JSON.stringify({
      expires_after: {
        anchor: "created_at",
        seconds: 600
      },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions,
        reasoning: {
          effort: "low"
        },
        audio: {
          input: {
            noise_reduction: {
              type: "near_field"
            },
            transcription: {
              model: "gpt-4o-mini-transcribe",
              language: "en",
              prompt: "Expect operational software, Homestead, artifacts, agents, repositories, and desktop-control vocabulary."
            },
            turn_detection: {
              type: "server_vad",
              create_response: true,
              interrupt_response: true,
              silence_duration_ms: 500,
              prefix_padding_ms: 300
            }
          },
          output: {
            voice: "marin"
          }
        },
        output_modalities: ["audio"],
        parallel_tool_calls: false,
        tool_choice: "none",
        tools: []
      }
    })
  });

  if (!response.ok) {
    await appendEvent(projectRoot, {
      type: "voice.client_secret_failed",
      sessionId,
      detail: {
        status: response.status
      }
    });
    throw new Error(`Realtime client secret request failed with status ${response.status}`);
  }

  const body = (await response.json()) as { value?: unknown; expires_at?: unknown };
  if (typeof body.value !== "string" || !body.value.startsWith("ek_")) {
    throw new Error("Realtime client secret response did not contain an ephemeral ek_ token");
  }

  await appendEvent(projectRoot, {
    type: "voice.client_secret_minted",
    sessionId,
    detail: {
      model: REALTIME_MODEL,
      expiresAt: typeof body.expires_at === "number" ? body.expires_at : null
    }
  });

  return {
    sessionId,
    clientSecret: body.value,
    expiresAt: typeof body.expires_at === "number" ? body.expires_at : undefined,
    model: REALTIME_MODEL,
    instructions
  } satisfies MintedRealtimeSecret;
}

export function buildMissionInstructions(stateSummary?: string) {
  const summary = stateSummary?.trim();
  if (!summary) return MISSION_CONTROL_INSTRUCTIONS;

  return `${MISSION_CONTROL_INSTRUCTIONS}\n\nCarry forward this session state summary after reconnect: ${summary}`;
}
