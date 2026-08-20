export const DOG_IDS = ["remy", "coco", "teddy", "osha"] as const;
export type DogId = (typeof DOG_IDS)[number];

export type DogProfile = {
  id: DogId;
  name: string;
  breed: string;
  blurb: string;
  scale: number;
  jump: number;
  slide: number;
  speed: number;
  hitW: number;
  hitH: number;
  bandana: string | null;
};

export const DOGS: Record<DogId, DogProfile> = {
  remy: {
    id: "remy",
    name: "Remy",
    breed: "Goldendoodle",
    blurb: "Blue bandana",
    scale: 1.08,
    jump: 1.08,
    slide: 1,
    speed: 1,
    hitW: 1.08,
    hitH: 1.04,
    bandana: "#2f6fb5",
  },
  coco: {
    id: "coco",
    name: "Coco",
    breed: "Goldendoodle",
    blurb: "Pink bandana",
    scale: 1.02,
    jump: 1.02,
    slide: 1.06,
    speed: 1.06,
    hitW: 1.0,
    hitH: 0.98,
    bandana: "#e37aa0",
  },
  teddy: {
    id: "teddy",
    name: "Teddy",
    breed: "Mini Goldendoodle",
    blurb: "Walks tunnels",
    scale: 0.7,
    jump: 0.92,
    slide: 0.92,
    speed: 1.12,
    hitW: 0.68,
    hitH: 0.62,
    bandana: null,
  },
  osha: {
    id: "osha",
    name: "Osha",
    breed: "Siberian Husky",
    blurb: "Chases cats",
    scale: 1,
    jump: 1,
    slide: 1.38,
    speed: 1.05,
    hitW: 0.98,
    hitH: 0.96,
    bandana: null,
  },
};

export function isDogId(v: unknown): v is DogId {
  return v === "remy" || v === "coco" || v === "teddy" || v === "osha";
}
