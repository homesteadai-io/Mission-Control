interface MarkdownArtifactProps {
  content: string;
}

export function MarkdownArtifact({ content }: MarkdownArtifactProps) {
  const blocks = content.split(/\n\n+/);

  return (
    <div className="markdown-artifact">
      {blocks.map((block, index) => {
        if (block.startsWith("# ")) return <h3 key={index}>{block.replace("# ", "")}</h3>;
        if (block.includes("\n- ")) {
          const [lead, ...items] = block.split("\n- ");
          return (
            <div key={index}>
              {lead ? <p>{lead}</p> : null}
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}
