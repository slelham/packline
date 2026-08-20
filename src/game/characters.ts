export const DOG_IDS = ["remy", "teddy", "osha"] as const;
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
};

export const DOGS: Record<DogId, DogProfile> = {
  remy: {
    id: "remy",
    name: "Remy",
    breed: "Goldendoodle",
    blurb: "Big leap",
    scale: 1.08,
    jump: 1.08,
    slide: 1,
    speed: 1,
    hitW: 1.08,
    hitH: 1.04,
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
  },
  osha: {
    id: "osha",
    name: "Osha",
    breed: "Siberian Husky",
    blurb: "Ice slide",
    scale: 1,
    jump: 1,
    slide: 1.38,
    speed: 1.05,
    hitW: 0.98,
    hitH: 0.96,
  },
};

export function isDogId(v: unknown): v is DogId {
  return v === "remy" || v === "teddy" || v === "osha";
}
