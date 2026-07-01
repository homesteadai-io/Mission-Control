import { X } from "lucide-react";

interface MenuOverlayProps {
  groups: Array<{ group: string; tools: string[] }>;
  onClose: () => void;
}

export function MenuOverlay({ groups, onClose }: MenuOverlayProps) {
  return (
    <div className="menu-backdrop" role="dialog" aria-modal="true" aria-label="Registered tools">
      <section className="menu-panel">
        <header>
          <div>
            <p>Registered Tools</p>
            <h2>Phase 1 menu surface</h2>
          </div>
          <button onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </header>
        <div className="tool-groups">
          {groups.map((group) => (
            <div className="tool-group" key={group.group}>
              <h3>{group.group}</h3>
              {group.tools.map((tool) => (
                <button key={tool}>{tool}</button>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
