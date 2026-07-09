import { X } from "lucide-react";

interface MenuOverlayProps {
  groups: Array<{ group: string; tools: Array<{ name: string; status: string }> }>;
  onClose: () => void;
}

export function MenuOverlay({ groups, onClose }: MenuOverlayProps) {
  return (
    <div className="menu-backdrop" role="dialog" aria-modal="true" aria-label="Registered tools">
      <section className="menu-panel">
        <header>
          <div>
            <p>Tool Surfaces</p>
            <h2>Active and planned routes</h2>
          </div>
          <button onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </header>
        <p className="menu-hint">This is a status board of Charli's tool surfaces — not clickable actions.</p>
        <div className="tool-groups">
          {groups.map((group) => (
            <div className="tool-group" key={group.group}>
              <h3>{group.group}</h3>
              {group.tools.map((tool) => (
                <div className="tool-row" key={tool.name} data-status={tool.status}>
                  <span>{tool.name}</span>
                  <small>{tool.status}</small>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
