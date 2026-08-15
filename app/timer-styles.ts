export const TIMER_STYLES = {
  "rabbit-carrot": {
    label: "Rabbit & Carrot",
    description: "A rabbit eats one carrot at a time.",
    thumbnail: "/images/sprites/rabbit-carrot.png",
    previewBackground: "#ff9cae",
    heroImage: "/images/sprites/rabbit-jump.png",
  },
  "blue-mood": {
    label: "Blue Mood",
    description: "A full-screen digital face with changing moods.",
    thumbnail: "/images/timer-styles/blue-mood-thumbnail.webp",
    previewBackground: "#168edc",
    heroImage: "/images/timer-styles/blue-mood-housing.webp",
  },
  "green-sleep": {
    label: "Green Sleep",
    description: "Sleeps through the countdown and wakes when time is up.",
    thumbnail: "/images/timer-styles/green-sleep-thumbnail.webp",
    previewBackground: "#78caa5",
    heroImage: "/images/timer-styles/green-sleep-housing.webp",
  },
  "rabbit-painter": {
    label: "Rabbit Painter",
    description: "A rabbit uncovers a pixel-art scene one square at a time.",
    thumbnail: "/images/sprites/paint-1.webp",
    previewBackground: "#f2c75c",
    heroImage: "/images/sprites/paint-1.webp",
  },
} as const;

export type TimerStyleId = keyof typeof TIMER_STYLES;

export const DEFAULT_TIMER_STYLE: TimerStyleId = "rabbit-carrot";

export function isTimerStyleId(value: unknown): value is TimerStyleId {
  return typeof value === "string" && value in TIMER_STYLES;
}
