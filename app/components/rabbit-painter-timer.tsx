import { useEffect, useMemo, useState } from "react";

const FRAME_SECONDS = 1;
const FRAMES_PER_CELL = 4;
const SECONDS_PER_CELL = FRAME_SECONDS * FRAMES_PER_CELL;

export function RabbitPainterTimer({ title, time, duration, remaining, paused, finished, wakeActive, wakeSupported, notificationEnabled, notificationsAvailable, onToggleWake, onToggleNotifications, onTogglePause, onReset }: {
  title: string; time: string; duration: number; remaining: number; paused: boolean; finished: boolean;
  wakeActive: boolean; wakeSupported: boolean; notificationEnabled: boolean; notificationsAvailable: boolean;
  onToggleWake: () => void; onToggleNotifications: () => void; onTogglePause: () => void; onReset: () => void;
}) {
  const [viewportRatio, setViewportRatio] = useState(16 / 9);

  useEffect(() => {
    const updateRatio = () => setViewportRatio(window.innerWidth / Math.max(1, window.innerHeight));
    updateRatio();
    window.addEventListener("resize", updateRatio);
    return () => window.removeEventListener("resize", updateRatio);
  }, []);

  const elapsed = Math.max(0, duration - remaining);
  const totalCells = Math.max(1, Math.ceil(duration / SECONDS_PER_CELL));
  const paintedCells = finished ? totalCells : Math.min(totalCells, Math.floor(elapsed / SECONDS_PER_CELL));
  const activeCell = Math.min(totalCells - 1, paintedCells);
  const frame = finished ? 4 : Math.floor(elapsed / FRAME_SECONDS) % FRAMES_PER_CELL + 1;
  const columns = Math.max(2, Math.ceil(Math.sqrt(totalCells * viewportRatio)));
  const rows = Math.max(1, Math.ceil(totalCells / columns));
  const activeColumn = activeCell % columns + 1;
  const activeRow = Math.floor(activeCell / columns) + 1;
  const cells = useMemo(() => Array.from({ length: totalCells }), [totalCells]);

  return <main className="painter-timer-shell">
    <div className="painter-scene" aria-hidden="true" />
    <section className="painter-grid" style={{ "--painter-columns": columns, "--painter-rows": rows } as React.CSSProperties} aria-label={`${paintedCells} of ${totalCells} squares painted`}>
      {cells.map((_, index) => {
        const isActive = index === activeCell && !finished;
        return <span className={`paint-mask-cell ${index < paintedCells || finished ? "painted" : ""} ${isActive ? `revealing frame-${frame}` : ""}`} key={index} />;
      })}
      {!finished && <div className={`painter-rabbit painter-frame-${frame}`} style={{ gridColumn: activeColumn, gridRow: activeRow }} />}
    </section>

    <div className="painter-status"><strong>{title}</strong><time>{time}</time><small>{finished ? "PAINTING COMPLETE" : paused ? "PAUSED" : `${paintedCells} / ${totalCells} SQUARES`}</small></div>
    <header className="blue-mood-controls painter-controls">
      <button className={wakeActive ? "active" : ""} onClick={onToggleWake} disabled={!wakeSupported} aria-label="Keep screen on">☀</button>
      <button className={notificationEnabled ? "active" : ""} onClick={onToggleNotifications} disabled={!notificationsAvailable} aria-label="Enable notifications">◇</button>
      <button onClick={onTogglePause} disabled={finished}>{paused ? "Resume" : "Pause"}</button>
      <button onClick={onReset}>Reset</button>
    </header>
  </main>;
}
