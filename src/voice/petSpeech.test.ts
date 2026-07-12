import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_CONFIG, decideSpeech, inQuietHours, spokenLineFor } from "./petSpeech";

const at = (hhmm: string) => new Date(`2026-07-12T${hhmm}:00`);

describe("quiet hours", () => {
  const config = { ...DEFAULT_VOICE_CONFIG, quietStart: "22:00", quietEnd: "07:00" };

  it("silences inside a midnight-crossing window", () => {
    expect(inQuietHours(config, at("23:30"))).toBe(true);
    expect(inQuietHours(config, at("03:00"))).toBe(true);
    expect(inQuietHours(config, at("12:00"))).toBe(false);
  });

  it("no quiet hours when unset", () => {
    expect(inQuietHours(DEFAULT_VOICE_CONFIG, at("03:00"))).toBe(false);
  });
});

describe("speech decisions", () => {
  it("speaks a completion when idle long enough", () => {
    const d = decideSpeech(DEFAULT_VOICE_CONFIG, "completed", null, 1_000_000, at("12:00"));
    expect(d.speak).toBe(true);
  });

  it("suppresses a second completion inside the debounce window", () => {
    const d = decideSpeech(DEFAULT_VOICE_CONFIG, "completed", 1_000_000, 1_060_000, at("12:01"));
    expect(d).toEqual({ speak: false, suppressed: "debounce" });
  });

  it("speaks again after the debounce window passes", () => {
    const d = decideSpeech(DEFAULT_VOICE_CONFIG, "completed", 1_000_000, 1_000_000 + 4 * 60_000, at("12:04"));
    expect(d.speak).toBe(true);
  });

  it("attention pings bypass debounce but not quiet hours", () => {
    const inside = decideSpeech(DEFAULT_VOICE_CONFIG, "attention", 1_000_000, 1_001_000, at("12:00"));
    expect(inside.speak).toBe(true);
    const quiet = { ...DEFAULT_VOICE_CONFIG, quietStart: "22:00", quietEnd: "07:00" };
    const silenced = decideSpeech(quiet, "attention", null, 1_000_000, at("23:00"));
    expect(silenced).toEqual({ speak: false, suppressed: "quiet-hours" });
  });

  it("disabled voice never speaks", () => {
    const d = decideSpeech({ ...DEFAULT_VOICE_CONFIG, enabled: false }, "completed", null, 0, at("12:00"));
    expect(d).toEqual({ speak: false, suppressed: "disabled" });
  });
});

describe("spoken lines", () => {
  it("takes the first sentence and strips markdown", () => {
    expect(spokenLineFor("completed", "Created **hello.md** in the workspace. It contains the date.")).toBe(
      "Created hello.md in the workspace."
    );
  });

  it("caps very long lines", () => {
    const line = spokenLineFor("completed", "word ".repeat(100));
    expect(line.length).toBeLessThanOrEqual(160);
  });

  it("fixed lines for failure and attention", () => {
    expect(spokenLineFor("failed", "boom")).toBe("Mission failed.");
    expect(spokenLineFor("attention", "")).toBe("Dutch needs you.");
  });
});
