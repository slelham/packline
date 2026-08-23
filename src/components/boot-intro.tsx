import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { DOG_IDS, DOGS } from "@/game/characters";

type Props = {
  ready: boolean;
  onDone: () => void;
};

export function BootIntro({ ready, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const readyRef = useRef(ready);
  const doneRef = useRef(false);
  const [frame, setFrame] = useState(1);

  readyRef.current = ready;

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    const el = rootRef.current;
    if (!el) {
      onDone();
      return;
    }
    gsap.to(el, {
      opacity: 0,
      duration: 0.32,
      ease: "power2.in",
      onComplete: onDone,
    });
  }

  useEffect(() => {
    const id = window.setInterval(() => setFrame((n) => (n % 4) + 1), 88);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const ctx = gsap.context(() => {
      const dogs = root.querySelectorAll("[data-dog]");
      const mark = root.querySelectorAll("[data-mark]");
      const bar = root.querySelector("[data-bar]");
      const sub = root.querySelectorAll("[data-sub]");
      gsap.set(mark, { opacity: 0, y: 18 });
      gsap.set(sub, { opacity: 0, y: 10 });
      gsap.set(dogs, { opacity: 0, y: 56, scale: 0.84 });
      gsap.set(bar, { scaleX: 0 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(mark, { opacity: 1, y: 0, duration: 0.42, stagger: 0.06 })
        .to(dogs, { opacity: 1, y: 0, scale: 1, duration: 0.52, stagger: 0.09, ease: "back.out(1.7)" }, "-=0.12")
        .to(sub, { opacity: 1, y: 0, duration: 0.28 }, "-=0.3")
        .to(bar, { scaleX: 0.68, duration: 0.7, ease: "power1.inOut" }, "-=0.55")
        .add(() => {
          if (!readyRef.current) tl.pause();
        })
        .to(bar, { scaleX: 1, duration: 0.2, ease: "power2.out" })
        .to(dogs, { x: 96, opacity: 0, duration: 0.38, stagger: 0.05, ease: "power2.in" }, "+=0.12")
        .to([mark, sub, bar], { opacity: 0, y: -8, duration: 0.22 }, "-=0.22")
        .add(finish);
      tlRef.current = tl;
    }, root);

    return () => {
      ctx.revert();
      tlRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      finish();
      return;
    }
    const tl = tlRef.current;
    if (tl?.paused()) tl.play();
  }, [ready]);

  return (
    <div
      ref={rootRef}
      data-ui
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg px-5"
      onPointerDown={() => {
        if (ready) finish();
      }}
    >
      <p data-mark className="font-display text-[11px] tracking-[0.38em] text-muted uppercase">
        The pack
      </p>
      <h1 data-mark className="font-display mt-2 text-5xl leading-none font-extrabold tracking-tight sm:text-6xl">
        Dog Park
      </h1>
      <p data-sub className="mt-2 text-sm text-muted">
        Four dogs. One park.
      </p>

      <ul className="mt-10 flex items-end justify-center gap-3 sm:gap-6">
        {DOG_IDS.map((id) => {
          const d = DOGS[id];
          return (
            <li key={id} data-dog className="flex w-20 flex-col items-center sm:w-24">
              <img
                src={`/sprites/${id}/run-${frame}.png?v=bandana`}
                alt=""
                draggable={false}
                className="h-20 w-20 object-contain sm:h-24 sm:w-24"
              />
              <p className="mt-2 text-sm font-medium">{d.name}</p>
              <p className="text-[10px] text-accent">{d.blurb}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-10 h-1 w-48 overflow-hidden rounded-full bg-elevated sm:w-64">
        <div data-bar className="h-full origin-left bg-accent" />
      </div>
      <p data-sub className="mt-3 text-[11px] tracking-[0.22em] text-subtle uppercase">
        {ready ? "Tap to run" : "Loading the pack"}
      </p>
    </div>
  );
}
