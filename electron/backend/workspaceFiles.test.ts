import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "./workspaceFiles";

describe("sanitizeFileName", () => {
  it("strips directory traversal and path separators", () => {
    expect(sanitizeFileName("..\\..\\evil.exe")).toBe("evil.exe");
    expect(sanitizeFileName("../../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\x\\doc.pdf")).toBe("doc.pdf");
  });

  it("replaces Windows-invalid and control characters", () => {
    expect(sanitizeFileName('re<po>rt:"v1".pdf')).toBe("re_po_rt__v1_.pdf");
    expect(sanitizeFileName("abc.txt")).toBe("a_b_c.txt");
  });

  it("keeps ordinary names with spaces and hyphens intact", () => {
    expect(sanitizeFileName("Q3 margin - draft (2).xlsx")).toBe("Q3 margin - draft (2).xlsx");
  });

  it("falls back for empty or dot-only names", () => {
    expect(sanitizeFileName("..")).toMatch(/^dropped-\d+$/);
    expect(sanitizeFileName("   ")).toMatch(/^dropped-\d+$/);
  });
});
