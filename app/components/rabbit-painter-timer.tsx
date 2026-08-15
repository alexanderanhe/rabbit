import { useMemo } from "react";

const FRAME_SECONDS = 1;
const FRAMES_PER_CELL = 4;
const SECONDS_PER_CELL = FRAME_SECONDS * FRAMES_PER_CELL;
const PAINTING_RATIO = 1275 / 1233;
const PAINTINGS = [
  "/images/sprites/paint-1.webp",
  "/images/sprites/paint-2.webp",
  "/images/sprites/paint-3.webp",
] as const;

function selectPainting(timerId: string) {
  const hash = [...timerId].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return PAINTINGS[hash % PAINTINGS.length];
}

export function RabbitPainterTimer({ timerId, title, time, duration, remaining, paused, finished, wakeActive, wakeSupported, notificationEnabled, notificationsAvailable, onToggleWake, onToggleNotifications, onTogglePause, onReset }: {
  timerId: string; title: string; time: string; duration: number; remaining: number; paused: boolean; finished: boolean;
  wakeActive: boolean; wakeSupported: boolean; notificationEnabled: boolean; notificationsAvailable: boolean;
  onToggleWake: () => void; onToggleNotifications: () => void; onTogglePause: () => void; onReset: () => void;
}) {
  const elapsed = Math.max(0, duration - remaining);
  const targetCells = Math.max(1, Math.ceil(duration / SECONDS_PER_CELL));
  const columns = Math.max(2, Math.ceil(Math.sqrt(targetCells * PAINTING_RATIO)));
  const rows = Math.max(1, Math.ceil(targetCells / columns));
  const totalCells = columns * rows;
  const secondsPerCell = duration / totalCells;
  const paintedCells = finished ? totalCells : secondsPerCell > 0 ? Math.min(totalCells, Math.floor(elapsed / secondsPerCell)) : 0;
  const activeCell = Math.min(totalCells - 1, paintedCells);
  const activeCellProgress = secondsPerCell > 0 ? (elapsed - paintedCells * secondsPerCell) / secondsPerCell : 0;
  const frame = finished ? FRAMES_PER_CELL : Math.min(FRAMES_PER_CELL, Math.floor(activeCellProgress * FRAMES_PER_CELL) + 1);
  const activeColumn = activeCell % columns + 1;
  const activeRow = Math.floor(activeCell / columns) + 1;
  const cells = useMemo(() => Array.from({ length: totalCells }), [totalCells]);
  const painting = selectPainting(timerId);

  return <main className="painter-timer-shell">
    <div className="painter-easel">
      <span className="painter-easel-support" aria-hidden="true" />
      <div className="painter-canvas-frame">
        <div className="painter-canvas">
          <div className="painter-scene" style={{ "--painter-image": `url(${painting})` } as React.CSSProperties} aria-hidden="true" />
          <section className="painter-grid" style={{ "--painter-columns": columns, "--painter-rows": rows } as React.CSSProperties} aria-label={`${paintedCells} of ${totalCells} squares painted`}>
            {cells.map((_, index) => {
              const isActive = index === activeCell && !finished;
              return <span className={`paint-mask-cell ${index < paintedCells || finished ? "painted" : ""} ${isActive ? `revealing frame-${frame}` : ""}`} key={index} />;
            })}
          </section>
        </div>
        {!finished && <div className="painter-rabbit-layer" style={{ "--painter-columns": columns, "--painter-rows": rows } as React.CSSProperties} aria-hidden="true">
          <div className={`painter-rabbit painter-frame-${frame}`} style={{ gridColumn: activeColumn, gridRow: activeRow }} />
        </div>}
      </div>
      <span className="painter-easel-shelf" aria-hidden="true" />
    </div>

    <div className="painter-status"><strong>{title}</strong><time>{time}</time><small>{finished ? "PAINTING COMPLETE" : paused ? "PAUSED" : `${paintedCells} / ${totalCells} SQUARES`}</small></div>
    <header className="blue-mood-controls painter-controls">
      <button className={wakeActive ? "active" : ""} onClick={onToggleWake} disabled={!wakeSupported} aria-label="Keep screen on">☀</button>
      <button className={notificationEnabled ? "active" : ""} onClick={onToggleNotifications} disabled={!notificationsAvailable} aria-label="Enable notifications">◇</button>
      <button onClick={onTogglePause} disabled={finished}>{paused ? "Resume" : "Pause"}</button>
      <button onClick={onReset}>Reset</button>
    </header>
  </main>;
}
