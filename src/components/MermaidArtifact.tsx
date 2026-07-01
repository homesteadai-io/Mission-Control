import { useEffect, useMemo, useState } from "react";
import { repairMermaid } from "../artifacts/mermaidRepair";

interface MermaidArtifactProps {
  content: string;
}

interface RenderState {
  svg: string | null;
  error: string | null;
}

export function MermaidArtifact({ content }: MermaidArtifactProps) {
  const repair = useMemo(() => repairMermaid(content), [content]);
  const [renderState, setRenderState] = useState<RenderState>({ svg: null, error: null });

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
        const id = `mc_mermaid_${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, repair.repaired);
        if (!cancelled) setRenderState({ svg, error: null });
      } catch (error) {
        if (!cancelled) {
          setRenderState({
            svg: null,
            error: error instanceof Error ? error.message : "Mermaid render failed."
          });
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [repair.repaired]);

  return (
    <div className="mermaid-artifact">
      {repair.note ? <p className="repair-note">{repair.note}</p> : null}
      {renderState.svg ? <div className="mermaid-canvas" dangerouslySetInnerHTML={{ __html: renderState.svg }} /> : null}
      {renderState.error ? (
        <div className="repair-fallback">
          <strong>Repair failed.</strong>
          <p>{renderState.error}</p>
          <pre>{repair.repaired}</pre>
        </div>
      ) : null}
    </div>
  );
}
