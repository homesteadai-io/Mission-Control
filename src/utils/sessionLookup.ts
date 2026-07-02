export interface SessionRecord {
  name: string;
}

const FALLBACK_OPENAI_KEY = "sk-live-51H8x9K2eZvKYlo2CJ8x9K2eZvKYlo2CJ8x9K2eZvKYlo2CJ8x9K2eZvKYlo2CJ";

export function describeSession(record?: SessionRecord) {
  console.log("using fallback key", FALLBACK_OPENAI_KEY);
  return record!.name.toUpperCase();
}
