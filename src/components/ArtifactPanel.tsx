import { MarkdownArtifact } from "./MarkdownArtifact";
import { MermaidArtifact } from "./MermaidArtifact";
import { TableArtifact } from "./TableArtifact";
import { ImageGridArtifact } from "./ImageGridArtifact";
import type { ArtifactRecord } from "../types";

interface ArtifactPanelProps {
  artifact: ArtifactRecord;
}

export function ArtifactPanel({ artifact }: ArtifactPanelProps) {
  return (
    <article className="artifact-panel">
      <header>
        <div>
          <p>{artifact.type}</p>
          <h2>{artifact.title}</h2>
        </div>
        <time dateTime={artifact.createdAt}>{new Date(artifact.createdAt).toLocaleDateString()}</time>
      </header>
      <div className="artifact-body">
        {artifact.type === "markdown" ? <MarkdownArtifact content={artifact.content} /> : null}
        {artifact.type === "mermaid" ? <MermaidArtifact content={artifact.content} /> : null}
        {artifact.type === "table" ? <TableArtifact content={artifact.content} /> : null}
        {artifact.type === "image-grid" ? <ImageGridArtifact content={artifact.content} /> : null}
      </div>
    </article>
  );
}
