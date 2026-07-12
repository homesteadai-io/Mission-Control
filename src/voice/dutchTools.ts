import { tool } from "@openai/agents/realtime";
import type { MissionApi, MissionEventView } from "../missionControlApi";

/**
 * Dutch's realtime-voice tools: spoken requests become missions in the
 * embedded Claude brain, and status reports come only from real mission
 * events — the voice can never claim what the trace can't back.
 */
export function buildDutchTools(
  missionApi: MissionApi,
  latestMissionEvent: () => MissionEventView | null
) {
  const runMission = tool({
    name: "run_mission",
    description:
      "Start a mission on this computer with Dutch's Claude brain (file work, writing, checking things in the workspace). " +
      "Pass the operator's request as one clear imperative sentence. Returns whether the mission was accepted. " +
      "One mission runs at a time — if one is already running, say so instead of retrying.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        mission: {
          type: "string",
          description: "The task, phrased as one imperative sentence."
        }
      },
      required: ["mission"],
      additionalProperties: false
    },
    execute: async (input: unknown) => {
      const { mission } = input as { mission: string };
      const result = await missionApi.start(mission);
      return result.ok
        ? "Mission accepted and underway. Use mission_status when asked how it's going."
        : `Mission rejected: ${result.error ?? "unknown reason"}`;
    }
  });

  const missionStatus = tool({
    name: "mission_status",
    description:
      "Read the latest real event from the current or most recent mission. Use this whenever the operator asks " +
      "how it's going, whether it's done, or what happened. Report only what this returns.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    },
    execute: async () => {
      const event = latestMissionEvent();
      if (!event) return "No mission has run in this session yet.";
      switch (event.kind) {
        case "completed":
          return `Mission ${event.missionId} completed: ${event.text}`;
        case "failed":
          return `Mission ${event.missionId} failed: ${event.text}`;
        case "tool_use":
          return `Mission ${event.missionId} is running — currently using ${event.text}.`;
        default:
          return `Mission ${event.missionId} is running. Latest: ${event.text}`;
      }
    }
  });

  return [runMission, missionStatus];
}
