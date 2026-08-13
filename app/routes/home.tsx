import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useNavigate, useParams } from "react-router";
import type { Route } from "./+types/home";
import type { PushSubscriptionData, RemoteTimerPayload } from "../services/backend.types";

type GridLayout = { columns: number; rows: number };
type StoredTimer = {
  id: string;
  token?: string;
  title?: string;
  duration: number;
  remaining: number;
  endAt: number | null;
  status: "running" | "paused" | "finished";
  createdAt: number;
};

const DEFAULT_GRID: GridLayout = { columns: 6, rows: 7 };
const TIMER_KEY_PREFIX = "carrot-timer:";
const WAKE_LOCK_PREFERENCE = "carrot-timer:wake-lock";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Carrot Timer" },
    {
      name: "description",
      content: "A pixel-art timer where a rabbit eats time, one carrot at a time.",
    },
  ];
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function calculateGridLayout(): GridLayout {
  if (typeof window === "undefined") return DEFAULT_GRID;

  const width = window.innerWidth;
  const compact = width <= 760;
  const horizontalPadding = compact ? 16 : 44;
  const usableWidth = Math.max(width - horizontalPadding, 280);
  const targetCellWidth = width < 480 ? 78 : width < 900 ? 92 : 112;
  const columns = Math.max(4, Math.min(12, Math.floor(usableWidth / targetCellWidth)));
  const usableHeight = Math.max(window.innerHeight - (compact ? 84 : 96) - horizontalPadding, 320);
  const cellWidth = usableWidth / columns;
  const rows = Math.max(4, Math.min(10, Math.floor(usableHeight / (cellWidth / 0.83))));

  return { columns, rows };
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

async function getPushSubscription(): Promise<PushSubscriptionData | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription())?.toJSON() as PushSubscriptionData | null;
}

async function registerRemoteTimer(timer: Omit<RemoteTimerPayload, "subscription">) {
  const subscription = await getPushSubscription();
  if (!subscription) return;
  await fetch("/api/timers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...timer, subscription }),
  }).catch(() => undefined);
}

async function updateRemoteTimer(id: string, token: string, payload: { status: "running" | "paused"; endAt?: number }) {
  await fetch(`/api/timers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

async function cancelRemoteTimer(id: string, token: string) {
  await fetch(`/api/timers/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
}

export default function Home() {
  const navigate = useNavigate();
  const { timerId } = useParams();
  const [timerTitle, setTimerTitle] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [duration, setDuration] = useState(300);
  const [remaining, setRemaining] = useState(300);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);
  const [grid, setGrid] = useState<GridLayout>(DEFAULT_GRID);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [loadedTimerId, setLoadedTimerId] = useState<string | null>(null);
  const [timerToken, setTimerToken] = useState<string | null>(null);
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const [wakeActive, setWakeActive] = useState(false);
  const [wakeSupported, setWakeSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const preferredCells = Math.max(1, grid.columns * grid.rows - 1);
  const totalCells = Math.max(1, Math.min(preferredCells, Math.floor(duration / 5)));
  const gridRatio = grid.columns / grid.rows;
  const renderedColumns = Math.min(
    grid.columns,
    Math.max(2, Math.ceil(Math.sqrt((totalCells + 1) * gridRatio * 0.75))),
  );
  const renderedRows = Math.max(1, Math.ceil((totalCells + 1) / renderedColumns));

  useEffect(() => {
    const updateGrid = () => setGrid(calculateGridLayout());
    setWakeSupported("wakeLock" in navigator);
    setWakeEnabled(window.localStorage.getItem(WAKE_LOCK_PREFERENCE) === "true");
    setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
    updateGrid();
    window.addEventListener("resize", updateGrid);
    return () => window.removeEventListener("resize", updateGrid);
  }, []);

  const timerIsActive = started && !paused && remaining > 0;

  useEffect(() => {
    if (!wakeEnabled || !wakeSupported || !timerIsActive) {
      wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
      setWakeActive(false);
      return;
    }

    let cancelled = false;
    const acquireWakeLock = async () => {
      if (document.visibilityState !== "visible" || wakeLockRef.current) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        setWakeActive(true);
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
          setWakeActive(false);
        }, { once: true });
      } catch {
        setWakeActive(false);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void acquireWakeLock();
    };
    void acquireWakeLock();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, [wakeEnabled, wakeSupported, timerIsActive]);

  useEffect(() => {
    if (!timerId) {
      setLoadedTimerId(null);
      return;
    }

    const rawTimer = window.localStorage.getItem(`${TIMER_KEY_PREFIX}${timerId}`);
    if (!rawTimer) {
      navigate("/", { replace: true });
      return;
    }

    try {
      const stored = JSON.parse(rawTimer) as StoredTimer;
      const token = stored.token || nanoid(32);
      const nextRemaining = stored.status === "running" && stored.endAt
        ? Math.max(0, Math.ceil((stored.endAt - Date.now()) / 1000))
        : stored.remaining;
      const finished = nextRemaining === 0;

      setDuration(stored.duration);
      setTimerTitle(stored.title || "Timer");
      setTimerToken(token);
      setMinutes(Math.max(1, Math.round(stored.duration / 60)));
      setRemaining(nextRemaining);
      setEndAt(finished ? null : stored.endAt);
      setPaused(stored.status === "paused");
      setCreatedAt(stored.createdAt);
      setStarted(true);
      setLoadedTimerId(timerId);
    } catch {
      window.localStorage.removeItem(`${TIMER_KEY_PREFIX}${timerId}`);
      navigate("/", { replace: true });
    }
  }, [timerId, navigate]);

  useEffect(() => {
    if (!endAt || paused) return;

    const tick = () => {
      const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) {
        setEndAt(null);
        setPaused(false);
      }
    };

    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [endAt, paused]);

  useEffect(() => {
    if (!started || !timerId || loadedTimerId !== timerId || createdAt === null) return;

    const stored: StoredTimer = {
      id: timerId,
      token: timerToken || undefined,
      title: timerTitle.trim() || "Timer",
      duration,
      remaining,
      endAt,
      status: remaining === 0 ? "finished" : paused ? "paused" : "running",
      createdAt,
    };
    window.localStorage.setItem(`${TIMER_KEY_PREFIX}${timerId}`, JSON.stringify(stored));
  }, [started, timerId, loadedTimerId, timerToken, timerTitle, duration, remaining, endAt, paused, createdAt]);

  useEffect(() => {
    if (!started || remaining !== 0 || !timerId || notificationPermission !== "granted") return;
    const notificationKey = `carrot-timer:notified:${timerId}`;
    if (window.localStorage.getItem(notificationKey)) return;
    window.localStorage.setItem(notificationKey, "true");

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => registration.showNotification(timerTitle.trim() || "Timer", {
        body: "Time’s up!",
        icon: "/images/icons/icon-192.png",
        badge: "/images/icons/icon-192.png",
        tag: `carrot-timer-${timerId}`,
        data: { url: `/timer/${timerId}` },
      })).catch(() => undefined);
    }
  }, [started, remaining, timerId, timerTitle, notificationPermission]);

  const elapsed = duration - remaining;
  const secondsPerCell = duration / totalCells;
  const completedCells = Math.min(totalCells, Math.floor(elapsed / secondsPerCell));
  const secondsIntoCell = elapsed - completedCells * secondsPerCell;
  const timeUntilNextCell = secondsPerCell - secondsIntoCell;
  let activeFrame = "sprite-frame-2";

  if (secondsPerCell <= 3) {
    const phase = secondsIntoCell / secondsPerCell;
    activeFrame = phase < 1 / 3 ? "sprite-frame-2" : phase < 2 / 3 ? "sprite-frame-3" : "sprite-frame-1";
  } else if (timeUntilNextCell <= 1) {
    activeFrame = "sprite-frame-1";
  } else {
    activeFrame = Math.floor(secondsIntoCell) % 2 === 0 ? "sprite-frame-2" : "sprite-frame-3";
  }
  const cells = useMemo(() => Array.from({ length: totalCells }), [totalCells]);

  const start = () => {
    const seconds = Math.max(1, Math.round(minutes)) * 60;
    const id = nanoid(10);
    const token = nanoid(32);
    const now = Date.now();
    const stored: StoredTimer = {
      id,
      token,
      title: timerTitle.trim() || "Timer",
      duration: seconds,
      remaining: seconds,
      endAt: now + seconds * 1000,
      status: "running",
      createdAt: now,
    };
    window.localStorage.setItem(`${TIMER_KEY_PREFIX}${id}`, JSON.stringify(stored));
    setDuration(seconds);
    setRemaining(seconds);
    setEndAt(stored.endAt);
    setPaused(false);
    setStarted(true);
    setCreatedAt(now);
    setLoadedTimerId(id);
    setTimerToken(token);
    navigate(`/timer/${id}`);
    void registerRemoteTimer({ id, token, title: stored.title || "Timer", duration: seconds, endAt: stored.endAt! });
  };

  const togglePause = () => {
    if (remaining === 0) return;
    if (paused) {
      const nextEndAt = Date.now() + remaining * 1000;
      setEndAt(nextEndAt);
      setPaused(false);
      if (timerId && timerToken) void updateRemoteTimer(timerId, timerToken, { status: "running", endAt: nextEndAt });
    } else {
      setPaused(true);
      setEndAt(null);
      if (timerId && timerToken) void updateRemoteTimer(timerId, timerToken, { status: "paused" });
    }
  };

  const reset = () => {
    if (timerId && timerToken && remaining > 0) void cancelRemoteTimer(timerId, timerToken);
    setStarted(false);
    setPaused(false);
    setEndAt(null);
    setRemaining(minutes * 60);
    setCreatedAt(null);
    setLoadedTimerId(null);
    setTimerToken(null);
    navigate("/");
  };

  const toggleWakeLock = () => {
    const next = !wakeEnabled;
    setWakeEnabled(next);
    window.localStorage.setItem(WAKE_LOCK_PREFERENCE, String(next));
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== "granted" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const response = await fetch("/api/push/config");
      if (!response.ok) return;
      const config = await response.json() as { enabled: boolean; publicKey?: string };
      if (!config.enabled || !config.publicKey) return;
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });

      if (timerId && timerToken && endAt && remaining > 0 && !paused) {
        const subscriptionData = subscription.toJSON() as PushSubscriptionData;
        await fetch("/api/timers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: timerId, token: timerToken, title: timerTitle.trim() || "Timer", duration, endAt, subscription: subscriptionData }),
        });
      }
    } catch {
      // Local notifications remain available when the push backend is offline.
    }
  };

  if (!started) {
    return (
      <main className="setup-shell">
        <section className="setup-card">
          <div className="brand"><span className="brand-carrot">◆</span> CARROT TIMER</div>
          <div className="setup-copy">
            <p className="eyebrow">A SIMPLE TIMER</p>
            <h1>Set it. <em>Done.</em></h1>
            <p className="intro">Name your timer, choose a duration, and let the rabbit handle the rest.</p>
          </div>

          <label className="title-input">
            <span>TIMER NAME</span>
            <input value={timerTitle} maxLength={48} onChange={(event) => setTimerTitle(event.target.value)} placeholder="e.g. Go to sleep" />
          </label>

          <div className="time-picker" aria-label="Timer duration">
            <button onClick={() => setMinutes((value) => Math.max(1, value - 1))} aria-label="Subtract one minute">−</button>
            <label>
              <input
                type="number"
                min="1"
                max="180"
                value={minutes}
                onChange={(event) => setMinutes(Math.min(180, Math.max(1, Number(event.target.value) || 1)))}
              />
              <span>MINUTES</span>
            </label>
            <button onClick={() => setMinutes((value) => Math.min(180, value + 1))} aria-label="Add one minute">+</button>
          </div>

          <button className="start-button" onClick={start}>
            Start timer <span aria-hidden="true">→</span>
          </button>
          <p className="hint">The route adapts automatically to your screen.</p>
          <div className="focus-options">
            <button type="button" className={wakeEnabled ? "enabled" : ""} onClick={toggleWakeLock} disabled={!wakeSupported}>
              <span aria-hidden="true">☀</span>
              <strong>Keep screen on</strong>
              <small>{!wakeSupported ? "Unavailable" : wakeEnabled ? "Enabled" : "Disabled"}</small>
            </button>
            <button type="button" className={notificationPermission === "granted" ? "enabled" : ""} onClick={enableNotifications} disabled={notificationPermission === "denied" || notificationPermission === "unsupported"}>
              <span aria-hidden="true">♢</span>
              <strong>Notify me</strong>
              <small>{notificationPermission === "granted" ? "Enabled" : notificationPermission === "denied" ? "Blocked" : notificationPermission === "unsupported" ? "Unavailable" : "Enable"}</small>
            </button>
          </div>
        </section>

        <aside className="rabbit-showcase" aria-hidden="true">
          <div className="sun" />
          <div className="showcase-sprite sprite-frame-1" />
          <p>ONE BITE<br />AT A TIME.</p>
        </aside>
      </main>
    );
  }

  const isFinished = remaining === 0;

  return (
    <main className={`timer-shell ${isFinished ? "is-finished" : ""}`}>
      <header className="timer-header">
        <div className="timer-title">
          <span className="mini-carrot">◆</span>
          <div><strong>{timerTitle.trim() || "Timer"}</strong><small>{completedCells} / {totalCells}</small></div>
        </div>
        <time>{formatTime(remaining)}</time>
        <div className="timer-actions">
          <button className={`status-button ${wakeActive ? "is-active" : ""}`} onClick={toggleWakeLock} disabled={!wakeSupported} aria-label="Keep screen on" title="Keep screen on">☀</button>
          <button className={`status-button ${notificationPermission === "granted" ? "is-active" : ""}`} onClick={enableNotifications} disabled={notificationPermission === "denied" || notificationPermission === "unsupported"} aria-label="Enable notifications" title="Notify when finished">♢</button>
          <button onClick={togglePause} disabled={isFinished}>{paused ? "Resume" : "Pause"}</button>
          <button className="icon-button" onClick={reset} aria-label="Reset">↻</button>
        </div>
      </header>

      <section
        className="carrot-grid"
        style={{ "--columns": renderedColumns, "--rows": renderedRows } as React.CSSProperties}
        aria-label={`${completedCells} of ${totalCells} carrots completed`}
      >
        {cells.map((_, index) => {
          let state = "future sprite-frame-4";
          if (index < completedCells) state = "eaten";
          else if (index === completedCells && !isFinished) state = `active ${activeFrame}`;
          return <div className={`grid-sprite ${state}`} key={index} aria-hidden="true" />;
        })}
        <div className="goal-cell" aria-label="Finish line" />
      </section>

      {isFinished && (
        <section className="timeout-overlay" role="status" aria-live="assertive">
          <div className="timeout-card">
            <div className="timeout-copy">
              <small>{timerTitle.trim() || "TIMER COMPLETE"}</small>
              <h2>TIME’S OUT!</h2>
            </div>
            <div className="timeout-art" aria-hidden="true">
              <img className="timeout-finish-line" src="/images/sprites/finish-line.webp" alt="" />
              <div className="celebration-sprite timeout-bunny" />
            </div>
            <button onClick={reset}>Start another timer <span>↻</span></button>
          </div>
        </section>
      )}
    </main>
  );
}
