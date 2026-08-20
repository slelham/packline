import { DOG_IDS, type DogId } from "./characters";

export type ActionSheets = {
  run: HTMLImageElement[];
  jump: HTMLImageElement[];
  slide: HTMLImageElement[];
  hurt: HTMLImageElement[];
  stretch: HTMLImageElement[];
};

export type SpriteBank = {
  dogs: Record<DogId, ActionSheets>;
  hurdle: HTMLImageElement;
  hoop: HTMLImageElement;
  tunnel: HTMLImageElement;
  weave: HTMLImageElement;
  crate: HTMLImageElement;
  hydrant: HTMLImageElement;
  pipe: HTMLImageElement;
  coin: HTMLImageElement[];
  impact: HTMLImageElement[];
  dust: HTMLImageElement[];
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function seq(folder: string, prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => loadImage(`/sprites/${folder}/${prefix}-${i + 1}.png`));
}

async function loadDog(id: DogId): Promise<ActionSheets> {
  const [run, jump, slide, hurt, stretch] = await Promise.all([
    Promise.all(seq(id, "run", 4)),
    Promise.all(seq(id, "jump", 4)),
    Promise.all(seq(id, "slide", 4)),
    Promise.all(seq(id, "hurt", 4)),
    Promise.all(seq(id, "stretch", 4)),
  ]);
  return { run, jump, slide, hurt, stretch };
}

export async function loadSprites(): Promise<SpriteBank> {
  const [dogs, coin, impact, dust, hurdle, hoop, tunnel, weave, crate, hydrant, pipe] = await Promise.all([
    Promise.all(DOG_IDS.map((id) => loadDog(id))),
    Promise.all(seq("fx", "ball", 4)),
    Promise.all(seq("fx", "impact", 4)),
    Promise.all(seq("fx", "dust", 4)),
    loadImage("/sprites/obstacles/hurdle.png"),
    loadImage("/sprites/obstacles/hoop.png"),
    loadImage("/sprites/obstacles/tunnel.png"),
    loadImage("/sprites/obstacles/weave.png"),
    loadImage("/sprites/obstacles/crate.png"),
    loadImage("/sprites/obstacles/hydrant.png"),
    loadImage("/sprites/obstacles/pipe.png"),
  ]);
  return {
    dogs: Object.fromEntries(DOG_IDS.map((id, i) => [id, dogs[i]!])) as Record<DogId, ActionSheets>,
    coin,
    impact,
    dust,
    hurdle,
    hoop,
    tunnel,
    weave,
    crate,
    hydrant,
    pipe,
  };
}
