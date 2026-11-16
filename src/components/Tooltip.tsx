import { uiStore, useStore } from '../state/store';

export function Tooltip() {
  const hover = useStore(uiStore, (s) => s.hover);
  if (!hover) return null;
  return (
    <div className="tooltip" role="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }} data-testid="map-tooltip">
      <strong>{hover.text}</strong>
      {hover.sub && <span>{hover.sub}</span>}
    </div>
  );
}
