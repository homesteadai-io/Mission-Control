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
        <div className="tool-groups">
          {groups.map((group) => (
            <div className="tool-group" key={group.group}>
              <h3>{group.group}</h3>
              {group.tools.map((tool) => (
                <button key={tool.name} disabled={tool.status !== "active"} aria-disabled={tool.status !== "active"}>
                  <span>{tool.name}</span>
                  <small>{tool.status}</small>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
