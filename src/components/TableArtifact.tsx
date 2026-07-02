interface TableArtifactProps {
  content: string;
}

export function TableArtifact({ content }: TableArtifactProps) {
  const parsedRows = parseRows(content);
  if (!parsedRows.ok) {
    return <ArtifactParseFailure message={parsedRows.message} content={content} />;
  }

  const rows = parsedRows.rows;
  const headers = Object.keys(rows[0] ?? {});

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={Object.values(row).join(":")}>
              {headers.map((header) => (
                <td key={header}>{row[header]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type TableCell = string | number | boolean;

function parseRows(content: string): { ok: true; rows: Record<string, TableCell>[] } | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
      return { ok: false, message: "Table artifact content must be a JSON array of row objects." };
    }
    return { ok: true, rows: parsed as Record<string, TableCell>[] };
  } catch {
    return { ok: false, message: "Table artifact content is not valid JSON." };
  }
}

function isRecord(value: unknown): value is Record<string, TableCell> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((cell) => ["string", "number", "boolean"].includes(typeof cell))
  );
}

function ArtifactParseFailure({ message, content }: { message: string; content: string }) {
  return (
    <div className="artifact-parse-failure">
      <strong>Artifact could not render.</strong>
      <p>{message}</p>
      <pre>{content}</pre>
    </div>
  );
}
