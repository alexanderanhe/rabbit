import { useEffect, useRef, useState } from "react";

const SHOT_SECONDS = 2;
const CELEBRATION_SECONDS = 4;
const FIXED_ACTION_SECONDS = SHOT_SECONDS + CELEBRATION_SECONDS;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function LeoSoccerTimer({ title, time, duration, remaining, paused, finished, wakeActive, wakeSupported, notificationEnabled, notificationsAvailable, onToggleWake, onToggleNotifications, onTogglePause, onReset }: {
  title: string; time: string; duration: number; remaining: number; paused: boolean; finished: boolean;
  wakeActive: boolean; wakeSupported: boolean; notificationEnabled: boolean; notificationsAvailable: boolean;
  onToggleWake: () => void; onToggleNotifications: () => void; onTogglePause: () => void; onReset: () => void;
}) {
  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const goalAudioRef = useRef<HTMLAudioElement | null>(null);
  const goalPlayedRef = useRef(false);
  const elapsed = Math.max(0, duration - remaining);
  const travelDuration = Math.max(1, duration - FIXED_ACTION_SECONDS);
  const travelProgress = clamp(elapsed / travelDuration);
  const phase = remaining > FIXED_ACTION_SECONDS ? "running" : remaining > CELEBRATION_SECONDS ? "kick" : "celebrate";
  const openingProgress = clamp(travelProgress / 0.22);
  const approachProgress = clamp((travelProgress - 0.88) / 0.12);
  const playerPosition = travelProgress < 0.22 ? 3 + openingProgress * 47 : travelProgress < 0.88 ? 50 : 50 + approachProgress * 18;
  const goalProgress = phase === "running" ? approachProgress : 1;
  const goalVisible = goalProgress > 0;
  const goalScored = phase === "celebrate";

  const parallaxStyle = {
    "--leo-far-position": `${travelProgress * 65}%`,
    "--leo-near-position": `${travelProgress * 100}%`,
  } as React.CSSProperties;

  useEffect(() => {
    const audio = ambientAudioRef.current;
    if (!audio) return;
    audio.volume = 0.38;
    if (!ambientEnabled) {
      audio.pause();
      return;
    }

    const play = () => void audio.play().catch(() => undefined);
    play();
    window.addEventListener("pointerdown", play, { once: true });
    window.addEventListener("keydown", play, { once: true });
    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
    };
  }, [ambientEnabled]);

  useEffect(() => {
    if (phase === "running") goalPlayedRef.current = false;
    if (phase !== "kick" || goalPlayedRef.current) return;
    const audio = goalAudioRef.current;
    if (!audio) return;
    goalPlayedRef.current = true;
    audio.volume = 0.9;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [phase]);

  useEffect(() => () => {
    ambientAudioRef.current?.pause();
    goalAudioRef.current?.pause();
  }, []);

  return <main className={`leo-timer-shell ${paused ? "is-paused" : ""} ${finished ? "is-finished" : ""}`} style={parallaxStyle}>
    <audio ref={ambientAudioRef} src="/audios/stadium.mp3" loop preload="auto" playsInline />
    <audio ref={goalAudioRef} src="/audios/stadium-gol.mp3" preload="auto" playsInline />
    <div className="leo-field-far" aria-hidden="true" />
    <div className="leo-field-principal" aria-hidden="true" />

    <div className="leo-player-track" role={finished ? "status" : undefined} aria-live={finished ? "assertive" : undefined}>
      {goalVisible && <div className={`leo-sequence-goal ${goalScored ? "is-scored" : ""}`} style={{ "--leo-goal-enter": `${(1 - goalProgress) * 130}%` } as React.CSSProperties} aria-hidden="true" />}
      {phase === "running" && <div className="leo-running-player" style={{ "--leo-left": `${playerPosition}%`, "--leo-offset": `${playerPosition * -1}%` } as React.CSSProperties} aria-hidden="true" />}
      {phase === "kick" && <div className="leo-kick-player leo-sequence-player" style={{ "--leo-left": `${playerPosition}%`, "--leo-offset": `${playerPosition * -1}%` } as React.CSSProperties} aria-hidden="true" />}
      {phase === "celebrate" && <div className="leo-celebration leo-sequence-player" style={{ "--leo-left": `${playerPosition}%`, "--leo-offset": `${playerPosition * -1}%` } as React.CSSProperties} aria-hidden="true" />}
    </div>

    <div className="leo-status">
      <strong>{title}</strong>
      <time>{time}</time>
      <small>{finished ? "TIEMPO COMPLETADO" : paused ? "PAUSA" : phase === "kick" ? "TIRO A GOL" : phase === "celebrate" ? "¡GOL!" : "CORRIENDO HACIA LA META"}</small>
    </div>

    <button type="button" className={`leo-audio-toggle ${ambientEnabled ? "is-active" : ""}`} onClick={() => setAmbientEnabled((enabled) => !enabled)} aria-pressed={ambientEnabled} aria-label={ambientEnabled ? "Mute stadium ambience" : "Play stadium ambience"} title={ambientEnabled ? "Mute stadium" : "Play stadium"}>{ambientEnabled ? "🔊" : "🔇"}</button>

    <header className="blue-mood-controls leo-controls">
      <button className={wakeActive ? "active" : ""} onClick={onToggleWake} disabled={!wakeSupported} aria-label="Keep screen on">☀</button>
      <button className={notificationEnabled ? "active" : ""} onClick={onToggleNotifications} disabled={!notificationsAvailable} aria-label="Enable notifications">◇</button>
      <button onClick={onTogglePause} disabled={finished}>{paused ? "Resume" : "Pause"}</button>
      <button onClick={onReset}>Reset</button>
    </header>
  </main>;
}
