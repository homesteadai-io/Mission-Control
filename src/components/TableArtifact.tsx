interface TableArtifactProps {
  content: string;
}

export function TableArtifact({ content }: TableArtifactProps) {
  const rows = JSON.parse(content) as Record<string, string>[];
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
