import { useEffect, useRef, useState } from "react";
import { IoNotificationsOutline, IoSunnyOutline } from "react-icons/io5";

const CROSS_SECONDS = 3;
const CELEBRATE_SECONDS = 4;
const FIXED_ACTION_SECONDS = CROSS_SECONDS + CELEBRATE_SECONDS;
// The starting-gate animation (cars leaving the pack for their home lane) is a fixed
// number of seconds, not a fraction of the total duration — otherwise a long timer
// (e.g. 30 minutes) spends minutes looking stuck at the starting line before the track
// ever scrolls. Short timers cap it further so it still finishes within the run.
const OPEN_SECONDS = 6;
const PACK_START = 4;
const FINISH_BY_RANK = [96, 84, 74];

export const CAR_VARIANTS = ["mcqueen", "chick", "king"] as const;
type CarId = typeof CAR_VARIANTS[number];
const CARS: Array<{ id: CarId; label: string }> = [
  { id: "mcqueen", label: "McQueen" },
  { id: "chick", label: "Chick" },
  { id: "king", label: "King" },
];

// Horizontal position is driven by rank (whoever is ahead sits further right), not by
// which car sprite it is — the progress bar at the bottom and the sprint/finish spread
// already order cars by rank, so the main lanes have to use the same rule or a car can
// end up drawn "in the back" up top while its progress dot shows it out in front.
const RUN_SPREAD = 14;
const laneHomeByRank = (rank: number) => 50 + (1 - rank) * RUN_SPREAD;

// McQueen (red) always races in the middle *depth* row (vertical position/size/z-index)
// for visual variety; the other two split the back/front rows. This is purely cosmetic
// depth, independent of rank — horizontal position (above) is what actually reads as
// "ahead" or "behind". Cars must be painted back-to-front (see CARS_BY_DEPTH) so a
// nearer row always renders over a farther one instead of z-fighting.
const LANE_BY_CAR: Record<CarId, "back" | "mid" | "front"> = { chick: "back", mcqueen: "mid", king: "front" };
const CARS_BY_DEPTH = (["back", "mid", "front"] as const).map((depth) => CARS.find((car) => LANE_BY_CAR[car.id] === depth)!);

// Concatenated track scenery: the start segment always plays first and the finish-line
// segment always plays last, with the two middle segments repeated in between as many
// times as the run needs — so a long timer keeps scrolling through fresh-looking track
// for its whole duration instead of idling on a single image. The segments are rendered
// as one glued-together flex strip and panned with a single transform (see
// race-track-strip below), so there's never a jump at the seam between two segments —
// it scrolls exactly as if it were one long track.
const TRACK_START = "/images/sprites/cars-pista.webp";
const TRACK_LOOP = ["/images/sprites/cars-pista-2.webp", "/images/sprites/cars-pista-3.webp"];
const TRACK_FINISH = "/images/sprites/cars-pista-end.webp";
// A short per-segment duration means the strip has to cover a lot more ground per
// second of real time, which is what actually reads as speed — the cars' own sprites
// never "run faster", the world just goes by 5x quicker underneath them.
const TRACK_SEGMENT_SECONDS = 8;
const MAX_TRACK_SEGMENTS = 400;

function buildTrackSegments(travelSeconds: number): string[] {
  const loopCount = Math.max(1, Math.min(MAX_TRACK_SEGMENTS, Math.round(travelSeconds / TRACK_SEGMENT_SECONDS) - 1));
  const loop = Array.from({ length: loopCount }, (_, i) => TRACK_LOOP[i % TRACK_LOOP.length]);
  return [TRACK_START, ...loop, TRACK_FINISH];
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const clampPercent = (value: number) => Math.max(4, Math.min(94, value));

function resolveWinner(variant?: string): CarId {
  return (CAR_VARIANTS as readonly string[]).includes(variant || "") ? (variant as CarId) : "mcqueen";
}

function rotated<T>(items: readonly T[], by: number): T[] {
  const len = items.length;
  const k = ((by % len) + len) % len;
  return [...items.slice(k), ...items.slice(0, k)];
}

// Who's "in front" changes a handful of times over the course of the run — not
// continuously (that reads as speeding up/slowing down, which we don't want), just a
// few clean, discrete swaps so no single car sits in first for the entire race. The
// last standing always lands back on the true finish order (rankedIds) well before the
// sprint phase begins, so the final overtake into position never contradicts who
// actually wins.
const STANDING_STEP_SECONDS = 90;

function liveRankedIds(rankedIds: CarId[], travelSeconds: number, trackProgress: number): CarId[] {
  const steps = Math.min(8, Math.max(3, Math.round(travelSeconds / STANDING_STEP_SECONDS)));
  const step = Math.min(steps - 1, Math.floor(clamp(trackProgress) * steps));
  return rotated(rankedIds, steps - 1 - step);
}

export function CarsRaceTimer({ variant, title, time, duration, remaining, paused, finished, wakeActive, wakeSupported, notificationEnabled, notificationsAvailable, onToggleWake, onToggleNotifications, onTogglePause, onReset }: {
  variant?: string; title: string; time: string; duration: number; remaining: number; paused: boolean; finished: boolean;
  wakeActive: boolean; wakeSupported: boolean; notificationEnabled: boolean; notificationsAvailable: boolean;
  onToggleWake: () => void; onToggleNotifications: () => void; onTogglePause: () => void; onReset: () => void;
}) {
  const winner = resolveWinner(variant);
  const rankedIds = [winner, ...CARS.map((car) => car.id).filter((id) => id !== winner)];

  const elapsed = Math.max(0, duration - remaining);
  const travelDuration = Math.max(1, duration - FIXED_ACTION_SECONDS);
  const openSeconds = Math.min(OPEN_SECONDS, travelDuration * 0.3);
  const runDuration = Math.max(1, travelDuration - openSeconds);
  const phase = remaining > FIXED_ACTION_SECONDS ? "running" : remaining > CELEBRATE_SECONDS ? "sprint" : "celebrate";

  const openProgress = clamp(elapsed / Math.max(1, openSeconds));
  const trackProgress = phase === "running" ? clamp((elapsed - openSeconds) / runDuration) : 1;
  const sprintProgress = phase === "sprint" ? clamp((FIXED_ACTION_SECONDS - remaining) / CROSS_SECONDS) : phase === "celebrate" ? 1 : 0;
  const overallProgress = clamp(elapsed / Math.max(1, duration)) * 100;

  const trackSegments = buildTrackSegments(travelDuration);

  // The strip is wider than its wrapper (segments are rendered edge to edge at full
  // track height), so the actual scrollable distance depends on real rendered pixel
  // sizes — measure it instead of guessing, and it stays correct across every viewport.
  const stripRef = useRef<HTMLDivElement>(null);
  const [scrollRange, setScrollRange] = useState(0);
  useEffect(() => {
    const strip = stripRef.current;
    const wrap = strip?.parentElement;
    if (!strip || !wrap) return;
    const measure = () => setScrollRange(Math.max(0, strip.scrollWidth - wrap.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [trackSegments.length]);

  const parallaxStyle = {
    "--race-far-position": `${trackProgress * 55}%`,
  } as React.CSSProperties;

  // During the race, standings rotate through a few clean steps; during the sprint and
  // celebration they must match the true finish order so the last overtake into
  // position (and the winner card) never contradicts who's actually drawn out front.
  const standingIds = phase === "running" ? liveRankedIds(rankedIds, travelDuration, trackProgress) : rankedIds;

  const winnerCar = CARS.find((car) => car.id === winner)!;

  return <main className={`race-timer-shell ${paused ? "is-paused" : ""} ${finished ? "is-finished" : ""}`} style={parallaxStyle}>
    <div className="race-sky" aria-hidden="true" />
    <div className="race-bg-far" aria-hidden="true" />

    <div className="race-track-block" aria-hidden="true">
      <div className="race-track-strip" ref={stripRef} style={{ transform: `translateX(${-clamp(trackProgress) * scrollRange}px)` }}>
        {trackSegments.map((src, i) => <div key={i} className="race-track-seg" style={{ backgroundImage: `url(${src})` }} />)}
      </div>
    </div>

    <div className="race-lanes" role={finished ? "status" : undefined} aria-live={finished ? "assertive" : undefined}>
      {CARS_BY_DEPTH.map((car) => {
        const rank = phase === "running" ? standingIds.indexOf(car.id) : rankedIds.indexOf(car.id);
        const lane = laneHomeByRank(rank);
        const runBase = elapsed < openSeconds ? PACK_START + openProgress * (lane - PACK_START) : lane;
        const left = phase === "running" ? clampPercent(runBase)
          : phase === "sprint" ? runBase + (FINISH_BY_RANK[rankedIds.indexOf(car.id)] - runBase) * sprintProgress
          : FINISH_BY_RANK[rankedIds.indexOf(car.id)];
        return <div
          key={car.id}
          className={`race-car race-car-${car.id} race-lane-${LANE_BY_CAR[car.id]} ${phase === "celebrate" && car.id !== winner ? "is-trailing" : ""}`}
          style={{ "--race-left": `${left}%`, "--race-offset": `${left * -1}%` } as React.CSSProperties}
          aria-hidden="true"
        />;
      })}
    </div>

    <div className="race-progress-track">
      <div className="race-progress-main" aria-hidden="true">
        <div className="race-progress-head">
          <span>Progress</span>
          <span>{Math.round(overallProgress)}%</span>
        </div>
        <div className="race-progress-line">
          <span className="race-progress-finish">🏁</span>
          {CARS.map((car) => {
            const rank = phase === "running" ? standingIds.indexOf(car.id) : rankedIds.indexOf(car.id);
            const miniLeft = Math.max(1, Math.min(99, overallProgress + (2 - rank) * 1.6));
            return <span key={car.id} className={`race-progress-dot race-progress-dot-${car.id}`} style={{ left: `${miniLeft}%` }} />;
          })}
        </div>
      </div>

      <header className="blue-mood-controls race-progress-controls">
        <button className={wakeActive ? "active" : ""} onClick={onToggleWake} disabled={!wakeSupported} aria-label="Keep screen on"><IoSunnyOutline /></button>
        <button className={notificationEnabled ? "active" : ""} onClick={onToggleNotifications} disabled={!notificationsAvailable} aria-label="Enable notifications"><IoNotificationsOutline /></button>
        <button onClick={onTogglePause} disabled={finished}>{paused ? "Resume" : "Pause"}</button>
        <button onClick={onReset}>Reset</button>
      </header>
    </div>

    {phase === "celebrate" && <div className="race-winner-reveal">
      <div className="race-winner-flags" aria-hidden="true" />
      <div className={`race-winner-card race-winner-${winner}`}>
        <span className="race-winner-front" aria-hidden="true" />
        <strong>🏁 {winnerCar.label} WINS THE RACE 🏁</strong>
      </div>
    </div>}

    <div className="race-status">
      <strong>{title}</strong>
      <time>{time}</time>
      <small>{finished ? "RACE COMPLETE" : paused ? "PAUSED" : phase === "sprint" ? "FINAL SPRINT" : phase === "celebrate" ? "WINNER!" : "RACING"}</small>
    </div>
  </main>;
}
