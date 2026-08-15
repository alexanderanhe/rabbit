import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Form, Link, useNavigate, useParams } from "react-router";
import { Drawer } from "vaul";
import type { Route } from "./+types/home";
import type { PushSubscriptionData, RemoteTimerPayload } from "../services/backend.types";
import { getCurrentUser } from "../services/auth.server";
import { getTimersCollection } from "../services/mongo.server";
import { TimerStyleSelect } from "../components/timer-style-select";
import { BlueMoodTimer } from "../components/blue-mood-timer";
import { RabbitPainterTimer } from "../components/rabbit-painter-timer";
import { DEFAULT_TIMER_STYLE, isTimerStyleId, TIMER_STYLES, type TimerStyleId } from "../timer-styles";

type GridLayout = { columns: number; rows: number };
type StoredTimer = {
  id: string;
  token?: string;
  title?: string;
  styleId?: TimerStyleId;
  duration: number;
  remaining: number;
  endAt: number | null;
  status: "running" | "paused" | "finished";
  createdAt: number;
};
type ActiveTimerSummary = { id: string; title: string; endAt: number };

const STYLE_GROUPS: Array<{ id: string; styles: TimerStyleId[] }> = [
  { id: "rabbit", styles: ["rabbit-carrot"] },
  { id: "faces", styles: ["blue-mood", "green-sleep"] },
  { id: "painter", styles: ["rabbit-painter"] },
];
const AUTOPLAY_STYLES = STYLE_GROUPS.flatMap((group) => group.styles);
const AUTOPLAY_INTERVAL = 5000;

const DEFAULT_GRID: GridLayout = { columns: 6, rows: 7 };
const TIMER_KEY_PREFIX = "carrot-timer:";
const WAKE_LOCK_PREFERENCE = "carrot-timer:wake-lock";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Rabbit Timer" },
    {
      name: "description",
      content: "A pixel-art timer where a rabbit eats time, one carrot at a time.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return { user: null, recentTitles: [] as string[], runningTimers: [] as ActiveTimerSummary[] };
    const { ObjectId } = await import("mongodb");
    const timers = await (await getTimersCollection()).find(
      { userId: new ObjectId(user.id) },
      { projection: { timerId: 1, title: 1, status: 1, endAt: 1 } },
    ).sort({ createdAt: -1 }).limit(50).toArray();
    const now = Date.now();
    return {
      user,
      recentTitles: [...new Set(timers.map((timer) => timer.title.trim()).filter((title) => title && title !== "Timer"))].slice(0, 8),
      runningTimers: timers.filter((timer) => timer.status === "running" && timer.endAt.getTime() > now).map((timer) => ({ id: timer.timerId, title: timer.title, endAt: timer.endAt.getTime() })),
    };
  } catch {
    return { user: null, recentTitles: [] as string[], runningTimers: [] as ActiveTimerSummary[] };
  }
}

function getInitials(name?: string, email?: string) {
  const source = name?.trim() || email?.split("@")[0]?.trim() || "Rabbit";
  const parts = source.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || "R"}${parts.length > 1 ? parts.at(-1)?.[0] || "" : ""}`.toUpperCase();
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
  await fetch("/api/timers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...timer, ...(subscription ? { subscription } : {}) }),
  }).catch(() => undefined);
}

async function updateRemoteTimer(id: string, token: string | null, payload: { status: "running" | "paused"; endAt?: number; remaining?: number }) {
  await fetch(`/api/timers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

async function cancelRemoteTimer(id: string, token: string | null) {
  await fetch(`/api/timers/${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => undefined);
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { timerId } = useParams();
  const [timerTitle, setTimerTitle] = useState("");
  const [timerStyle, setTimerStyle] = useState<TimerStyleId>(DEFAULT_TIMER_STYLE);
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [localTitles, setLocalTitles] = useState<string[]>([]);
  const [localRunningTimers, setLocalRunningTimers] = useState<ActiveTimerSummary[]>([]);
  const [galleryNow, setGalleryNow] = useState(0);
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
    const storedTimers = Object.keys(window.localStorage)
      .filter((key) => key.startsWith(TIMER_KEY_PREFIX) && !key.includes("wake-lock") && !key.includes("notified"))
      .flatMap((key) => {
        try {
          const stored = JSON.parse(window.localStorage.getItem(key) || "null") as StoredTimer | null;
          return stored ? [stored] : [];
        } catch { return []; }
      });
    const titles = storedTimers
      .map((stored) => ({ title: stored.title?.trim() || "", createdAt: stored.createdAt || 0 }))
      .filter(({ title }) => title && title !== "Timer")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ title }) => title);
    setLocalTitles([...new Set(titles)].slice(0, 8));
    setLocalRunningTimers(storedTimers
      .filter((stored) => stored.status === "running" && typeof stored.endAt === "number" && stored.endAt > Date.now())
      .map((stored) => ({ id: stored.id, title: stored.title?.trim() || "Timer", endAt: stored.endAt! })));
    updateGrid();
    window.addEventListener("resize", updateGrid);
    return () => window.removeEventListener("resize", updateGrid);
  }, []);

  const timerIsActive = started && !paused && remaining > 0;

  useEffect(() => {
    if (started || drawerOpen) return;
    const interval = window.setInterval(() => {
      setTimerStyle((current) => {
        const currentIndex = AUTOPLAY_STYLES.indexOf(current);
        return AUTOPLAY_STYLES[(currentIndex + 1) % AUTOPLAY_STYLES.length];
      });
    }, AUTOPLAY_INTERVAL);
    return () => window.clearInterval(interval);
  }, [started, drawerOpen]);

  useEffect(() => {
    if (started) return;
    const updateGalleryClock = () => setGalleryNow(Date.now());
    updateGalleryClock();
    const interval = window.setInterval(updateGalleryClock, 1000);
    return () => window.clearInterval(interval);
  }, [started]);

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

    const loadTimer = async () => {
      let stored: StoredTimer;
      const rawTimer = window.localStorage.getItem(`${TIMER_KEY_PREFIX}${timerId}`);
      if (rawTimer) stored = JSON.parse(rawTimer) as StoredTimer;
      else {
        const response = await fetch(`/api/timers/${timerId}`);
        if (!response.ok) { navigate("/", { replace: true }); return; }
        stored = await response.json() as StoredTimer;
      }

      const token = stored.token || null;
      const nextRemaining = stored.status === "running" && stored.endAt
        ? Math.max(0, Math.ceil((stored.endAt - Date.now()) / 1000))
        : stored.remaining;
      const finished = nextRemaining === 0;

      setDuration(stored.duration);
      setTimerTitle(stored.title || "Timer");
      setTimerStyle(isTimerStyleId(stored.styleId) ? stored.styleId : DEFAULT_TIMER_STYLE);
      setTimerToken(token);
      setMinutes(Math.max(1, Math.round(stored.duration / 60)));
      setRemaining(nextRemaining);
      setEndAt(finished ? null : stored.endAt);
      setPaused(stored.status === "paused");
      setCreatedAt(stored.createdAt);
      setStarted(true);
      setLoadedTimerId(timerId);
    };
    loadTimer().catch(() => {
      window.localStorage.removeItem(`${TIMER_KEY_PREFIX}${timerId}`);
      navigate("/", { replace: true });
    });
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
      ...(timerToken ? { token: timerToken } : {}),
      title: timerTitle.trim() || "Timer",
      styleId: timerStyle,
      duration,
      remaining,
      endAt,
      status: remaining === 0 ? "finished" : paused ? "paused" : "running",
      createdAt,
    };
    window.localStorage.setItem(`${TIMER_KEY_PREFIX}${timerId}`, JSON.stringify(stored));
  }, [started, timerId, loadedTimerId, timerToken, timerTitle, timerStyle, duration, remaining, endAt, paused, createdAt]);

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
  const remoteTitles = loaderData?.recentTitles ?? [];
  const recentTitles = useMemo(() => [...new Set([...localTitles, ...remoteTitles])].slice(0, 8), [localTitles, remoteTitles]);
  const remoteRunningTimers = loaderData?.runningTimers ?? [];
  const runningTimers = useMemo(() => {
    const timers = [...localRunningTimers, ...remoteRunningTimers];
    return [...new Map(timers.map((timer) => [timer.id, timer])).values()].sort((a, b) => a.endAt - b.endAt);
  }, [localRunningTimers, remoteRunningTimers]);
  const visibleRunningTimers = useMemo(
    () => galleryNow === 0 ? runningTimers : runningTimers.filter((timer) => timer.endAt > galleryNow),
    [galleryNow, runningTimers],
  );
  const selectedStyle = TIMER_STYLES[timerStyle];
  const selectedGroup = STYLE_GROUPS.find((group) => group.styles.includes(timerStyle))?.id;
  const currentUser = loaderData?.user ?? null;

  const chooseTimerStyle = (styleId: TimerStyleId) => {
    setTimerStyle(styleId);
    setDrawerOpen(true);
  };

  const moveTimerStyle = (direction: -1 | 1) => {
    setTimerStyle((current) => {
      const currentIndex = AUTOPLAY_STYLES.indexOf(current);
      return AUTOPLAY_STYLES[(currentIndex + direction + AUTOPLAY_STYLES.length) % AUTOPLAY_STYLES.length];
    });
  };

  const handleStyleGalleryKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveTimerStyle(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
      event.preventDefault();
      setDrawerOpen(true);
    }
  };

  const start = () => {
    const seconds = Math.max(1, Math.round(minutes)) * 60;
    const id = nanoid(10);
    const token = nanoid(32);
    const now = Date.now();
    const stored: StoredTimer = {
      id,
      token,
      title: timerTitle.trim() || "Timer",
      styleId: timerStyle,
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
    setDrawerOpen(false);
    navigate(`/timer/${id}`);
    void registerRemoteTimer({ id, token, title: stored.title || "Timer", styleId: timerStyle, duration: seconds, endAt: stored.endAt! });
  };

  const togglePause = () => {
    if (remaining === 0) return;
    if (paused) {
      const nextEndAt = Date.now() + remaining * 1000;
      setEndAt(nextEndAt);
      setPaused(false);
      if (timerId) void updateRemoteTimer(timerId, timerToken, { status: "running", endAt: nextEndAt });
    } else {
      setPaused(true);
      setEndAt(null);
      if (timerId) void updateRemoteTimer(timerId, timerToken, { status: "paused", remaining });
    }
  };

  const reset = () => {
    if (timerId && remaining > 0) void cancelRemoteTimer(timerId, timerToken);
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
          body: JSON.stringify({ id: timerId, token: timerToken, title: timerTitle.trim() || "Timer", styleId: timerStyle, duration, endAt, subscription: subscriptionData }),
        });
      }
    } catch {
      // Local notifications remain available when the push backend is offline.
    }
  };

  if (!started) {
    return (
      <main className={`style-gallery-shell style-gallery-${timerStyle}`} style={{ "--gallery-background": selectedStyle.previewBackground } as React.CSSProperties}>
        <div className="style-gallery-hero" aria-hidden="true">
          {timerStyle === "rabbit-carrot" ? <div className="style-gallery-animated-sprite rabbit-eating-preview" />
            : timerStyle === "rabbit-painter" ? <div className="style-gallery-animated-sprite rabbit-painting-preview" />
              : timerStyle === "blue-mood" || timerStyle === "green-sleep" ? <div className={`mood-sprite-preview ${timerStyle}`}>
                <img src={selectedStyle.heroImage} alt="" />
                <span className="mood-expression-sprite" />
              </div>
                : <img src={selectedStyle.heroImage} alt="" />}
        </div>

        <header className="style-gallery-topbar">
          <div className="style-gallery-mark" aria-label="Rabbit Timer"><img src="/images/icons/icon-192.png" alt="" /></div>
          <nav className="style-gallery-menus" aria-label="Timer and account menus">
            <details className="gallery-menu running-menu">
              <summary aria-label={`${visibleRunningTimers.length} active timers`} title="Active timers"><span aria-hidden="true">◷</span>{visibleRunningTimers.length > 0 && <b>{visibleRunningTimers.length}</b>}</summary>
              <div className="gallery-dropdown">
                <strong>RUNNING</strong>
                {visibleRunningTimers.length === 0 ? <p>NO ACTIVE TIMERS</p> : visibleRunningTimers.map((timer) => <Link key={timer.id} to={`/timer/${timer.id}`}><span><em>{timer.title}</em><time>{galleryNow === 0 ? "--:--" : formatTime(Math.max(0, Math.ceil((timer.endAt - galleryNow) / 1000)))}</time></span><i>→</i></Link>)}
              </div>
            </details>
            <details className="gallery-menu account-menu">
              <summary className="gallery-avatar" aria-label="Account menu" title="Account">{currentUser ? getInitials(currentUser.name, currentUser.email) : "?"}</summary>
              <div className="gallery-dropdown">
                {currentUser && <strong>{currentUser.name || currentUser.email}</strong>}
                <Link to="/account">ACCOUNT <i>→</i></Link>
                {currentUser && <Form action="/logout" method="post"><button type="submit">SIGN OUT <i>×</i></button></Form>}
              </div>
            </details>
          </nav>
        </header>

        <section className="style-gallery-picker" aria-label="Choose a timer style. Use left and right arrow keys to browse." tabIndex={0} onKeyDown={handleStyleGalleryKeyDown}>
          {STYLE_GROUPS.map((group) => {
            const groupStyleId = group.styles.includes(timerStyle) ? timerStyle : group.styles[0];
            const groupStyle = TIMER_STYLES[groupStyleId];
            const visibleStyles = group.styles.slice(0, 3);
            const hiddenCount = group.styles.length - visibleStyles.length;
            return <div key={group.id} className={`style-choice-group ${selectedGroup === group.id ? "is-selected" : ""}`}>
              <button type="button" className="style-choice-main" onClick={() => chooseTimerStyle(groupStyleId)} aria-label={`Use ${groupStyle.label}`} title={groupStyle.label}>
                <img src={groupStyleId === "rabbit-carrot" ? TIMER_STYLES["rabbit-carrot"].heroImage : groupStyle.thumbnail} alt="" />
              </button>
              <div className="style-choice-variants">
                {visibleStyles.map((styleId) => {
                  const style = TIMER_STYLES[styleId];
                  return <button key={styleId} type="button" className={timerStyle === styleId ? "is-selected" : ""} onClick={() => chooseTimerStyle(styleId)} aria-label={`Use ${style.label}`} title={style.label}><img src={styleId === "rabbit-carrot" ? style.heroImage : style.thumbnail} alt="" /></button>;
                })}
                {hiddenCount > 0 && <button type="button" className="style-choice-more" onClick={() => chooseTimerStyle(group.styles[3])} aria-label={`${hiddenCount} more timer styles`}>+{hiddenCount}</button>}
              </div>
            </div>;
          })}
        </section>

        <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} shouldScaleBackground={false}>
          <Drawer.Portal>
            <Drawer.Overlay className="timer-drawer-overlay" />
            <Drawer.Content className="timer-drawer-content">
              <div className="drawer-handle" aria-hidden="true" />
              <div className="timer-drawer-inner">
                <div className="drawer-heading"><div><p>NEW TIMER</p><Drawer.Title>Ready to run?</Drawer.Title></div><Drawer.Close className="drawer-close" aria-label="Close timer settings">×</Drawer.Close></div>
                <Drawer.Description className="drawer-description">Adjust the time or give this timer a name.</Drawer.Description>

                <div className="time-picker drawer-time-picker" aria-label="Timer duration">
                  <button onClick={() => setMinutes((value) => Math.max(1, value - 1))} aria-label="Subtract one minute">−</button>
                  <label><input type="number" min="1" max="180" value={minutes} onChange={(event) => setMinutes(Math.min(180, Math.max(1, Number(event.target.value) || 1)))} /><span>MINUTES</span></label>
                  <button onClick={() => setMinutes((value) => Math.min(180, value + 1))} aria-label="Add one minute">+</button>
                </div>

                <div className="timer-identity-row">
                  <label className="title-input drawer-title-input"><span>TIMER NAME <i>OPTIONAL</i></span><input value={timerTitle} maxLength={48} onChange={(event) => setTimerTitle(event.target.value)} placeholder="e.g. Go to sleep" /></label>
                  <TimerStyleSelect value={timerStyle} onChange={setTimerStyle} />
                </div>
                {recentTitles.length > 0 && <div className="recent-titles"><span>PREVIOUS TIMER NAMES</span><div>{recentTitles.map((title) => <button type="button" key={title} className={timerTitle === title ? "selected" : ""} onClick={() => setTimerTitle(title)}>{title}</button>)}</div></div>}

                <div className="focus-options drawer-options">
                  <button type="button" className={wakeEnabled ? "enabled" : ""} onClick={toggleWakeLock} disabled={!wakeSupported}><span aria-hidden="true">☀</span><strong>Keep screen on</strong><small>{!wakeSupported ? "Unavailable" : wakeEnabled ? "Enabled" : "Disabled"}</small></button>
                  <button type="button" className={notificationPermission === "granted" ? "enabled" : ""} onClick={enableNotifications} disabled={notificationPermission === "denied" || notificationPermission === "unsupported"}><span aria-hidden="true">♢</span><strong>Notify me</strong><small>{notificationPermission === "granted" ? "Enabled" : notificationPermission === "denied" ? "Blocked" : notificationPermission === "unsupported" ? "Unavailable" : "Enable"}</small></button>
                </div>
                <button className="start-button drawer-start" onClick={start}>Start {minutes} min timer <span aria-hidden="true">→</span></button>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </main>
    );
  }

  const isFinished = remaining === 0;

  if (timerStyle === "blue-mood" || timerStyle === "green-sleep") {
    return <BlueMoodTimer variant={timerStyle === "green-sleep" ? "green-sleep" : "blue"} title={timerTitle.trim() || "Timer"} time={formatTime(remaining)} progress={duration > 0 ? (duration - remaining) / duration : 0} paused={paused} finished={isFinished} wakeActive={wakeActive} wakeSupported={wakeSupported} notificationEnabled={notificationPermission === "granted"} notificationsAvailable={notificationPermission !== "denied" && notificationPermission !== "unsupported"} onToggleWake={toggleWakeLock} onToggleNotifications={enableNotifications} onTogglePause={togglePause} onReset={reset} />;
  }

  if (timerStyle === "rabbit-painter") {
    return <RabbitPainterTimer timerId={timerId || "preview"} title={timerTitle.trim() || "Timer"} time={formatTime(remaining)} duration={duration} remaining={remaining} paused={paused} finished={isFinished} wakeActive={wakeActive} wakeSupported={wakeSupported} notificationEnabled={notificationPermission === "granted"} notificationsAvailable={notificationPermission !== "denied" && notificationPermission !== "unsupported"} onToggleWake={toggleWakeLock} onToggleNotifications={enableNotifications} onTogglePause={togglePause} onReset={reset} />;
  }

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
