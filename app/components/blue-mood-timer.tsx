import { useEffect, useRef, useState } from "react";
import { IoNotificationsOutline, IoSunnyOutline } from "react-icons/io5";

type Gesture = "smile" | "happy" | "stars" | "sleep" | "awake";
type MoodVariant = "blue" | "green-sleep";

const quadrant = (color: string, angles: number[]) => angles.map((angle) => ({ color, angle }));
const PROGRESS_SEGMENTS = [
  ...quadrant("green", [-9, -27, -45, -63, -81]),
  ...quadrant("yellow", [-99, -117, -135, -153, -171]),
  ...quadrant("orange", [-189, -207, -225, -243, -261]),
  ...quadrant("red", [-279, -297, -315, -333, -351]),
];

export function BlueMoodTimer({ variant, title, time, progress, paused, finished, wakeActive, wakeSupported, notificationEnabled, notificationsAvailable, onToggleWake, onToggleNotifications, onTogglePause, onReset }: {
  variant: MoodVariant; title: string; time: string; progress: number; paused: boolean; finished: boolean;
  wakeActive: boolean; wakeSupported: boolean; notificationEnabled: boolean; notificationsAvailable: boolean;
  onToggleWake: () => void; onToggleNotifications: () => void; onTogglePause: () => void; onReset: () => void;
}) {
  const sleepingVariant = variant === "green-sleep";
  const [gesture, setGesture] = useState<Gesture>(sleepingVariant ? "sleep" : "smile");
  const finishAudioRef = useRef<HTMLAudioElement | null>(null);
  const finishAudioPlayedRef = useRef(false);
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  const remainingSegments = finished ? 0 : Math.ceil((1 - normalizedProgress) * 20);
  const removedSegments = 20 - remainingSegments;

  useEffect(() => {
    if (sleepingVariant) {
      setGesture(finished ? "awake" : "sleep");
      return;
    }
    if (finished) { setGesture("stars"); return; }
    if (paused) { setGesture("happy"); return; }

    let timeout = 0;
    const beginSequence = () => {
      setGesture("happy");
      timeout = window.setTimeout(() => {
        setGesture("stars");
        timeout = window.setTimeout(() => {
          setGesture("smile");
          timeout = window.setTimeout(beginSequence, 4_000 + Math.random() * 4_000);
        }, 1_050);
      }, 950);
    };
    setGesture("smile");
    timeout = window.setTimeout(beginSequence, 3_000 + Math.random() * 3_500);
    return () => window.clearTimeout(timeout);
  }, [sleepingVariant, paused, finished]);

  useEffect(() => {
    const audio = finishAudioRef.current;
    if (!audio) return;
    if (!finished) {
      finishAudioPlayedRef.current = false;
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    if (finishAudioPlayedRef.current) return;
    finishAudioPlayedRef.current = true;
    audio.volume = 0.85;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [finished]);

  useEffect(() => () => finishAudioRef.current?.pause(), []);

  const housing = sleepingVariant ? "/images/timer-styles/green-sleep-housing.webp" : "/images/timer-styles/blue-mood-housing.webp";

  return <main className={`blue-mood-shell ${sleepingVariant ? "green-sleep-shell" : ""}`}>
    <audio ref={finishAudioRef} src="/audios/ticking-bomb.mp3" preload="auto" playsInline />
    <div className="blue-mood-stage">
      <img className="blue-mood-housing" src={housing} alt="" />
      <div className="blue-mood-display">
        <div className="blue-mood-progress" aria-label={`${20 - removedSegments} of 20 time segments remaining`}>
          {PROGRESS_SEGMENTS.map((segment, index) => <span className={`segment-${segment.color} ${index < removedSegments ? "removed" : ""}`} style={{ "--segment-angle": `${segment.angle}deg` } as React.CSSProperties} key={`${segment.color}-${segment.angle}`} />)}
        </div>
        <div className={`blue-mood-face gesture-${gesture}`} aria-hidden="true">
          <span className="eye eye-left"><svg viewBox="0 0 100 100"><path d="M50 9 62 36 91 39 69 59 76 88 50 72 24 88 31 59 9 39 38 36Z" /></svg></span>
          <span className="eye eye-right"><svg viewBox="0 0 100 100"><path d="M50 9 62 36 91 39 69 59 76 88 50 72 24 88 31 59 9 39 38 36Z" /></svg></span>
          <span className="mouth" />
          <span className="sleep-symbols">z<em>z</em></span>
        </div>
        <time>{time}</time>
        <strong>{finished ? "TIME'S UP" : paused ? "PAUSED" : title}</strong>
      </div>
    </div>
    <header className="blue-mood-controls">
      <button className={wakeActive ? "active" : ""} onClick={onToggleWake} disabled={!wakeSupported} aria-label="Keep screen on"><IoSunnyOutline /></button>
      <button className={notificationEnabled ? "active" : ""} onClick={onToggleNotifications} disabled={!notificationsAvailable} aria-label="Enable notifications"><IoNotificationsOutline /></button>
      <button onClick={onTogglePause} disabled={finished}>{paused ? "Resume" : "Pause"}</button>
      <button onClick={onReset}>Reset</button>
    </header>
  </main>;
}
