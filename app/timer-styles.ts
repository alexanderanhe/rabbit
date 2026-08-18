export const TIMER_STYLES = {
  "rabbit-carrot": {
    label: "Rabbit & Carrot",
    description: "A rabbit eats one carrot at a time.",
    thumbnail: "/images/sprites/rabbit-carrot.png",
    previewBackground: "#ff9cae",
    heroImage: "/images/sprites/rabbit-jump.png",
  },
  "bear-honey": {
    label: "Bear & Honey",
    description: "A bear enjoys one pot of honey at a time.",
    thumbnail: "/images/sprites/bear-1.webp",
    previewBackground: "#e8ad52",
    heroImage: "/images/sprites/bear-1.webp",
  },
  "mouse-cheese": {
    label: "Mouse & Cheese",
    description: "A mouse nibbles one piece of cheese at a time.",
    thumbnail: "/images/sprites/mouse-1.webp",
    previewBackground: "#8fcfc5",
    heroImage: "/images/sprites/mouse-1.webp",
  },
  "leo-soccer": {
    label: "Leo Soccer",
    description: "Leo runs across the field and scores when time is up.",
    thumbnail: "/images/sprites/leo-run-1.webp",
    previewBackground: "#72c8f2",
    heroImage: "/images/sprites/leo-run-1.webp",
  },
  "cars-race": {
    label: "Cars Race",
    description: "Three cars race down the track and only one wins when time is up.",
    thumbnail: "/images/sprites/cars/mcqueen-run.webp",
    previewBackground: "#161b3a",
    heroImage: "/images/sprites/cars/mcqueen-run.webp",
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
