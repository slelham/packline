import { useEffect, useRef, useState, type PointerEventHandler, type SyntheticEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronsDown, ChevronsUp, Heart, RotateCcw, Share2, Volume2, VolumeX } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { BootIntro } from "@/components/boot-intro";
import { DOG_IDS, DOGS, type DogId } from "@/game/characters";
import { PacklineGame, type HudState, type Phase } from "@/game/engine";
import { cn } from "@/lib/utils";

const idleHud: HudState = {
  phase: "boot",
  score: 0,
  highScore: 0,
  combo: 0,
  speed: 0,
  distance: 0,
  bestCombo: 0,
  newBest: false,
  muted: false,
  ready: false,
  lastRunCombo: 0,
  lastRunThreads: 0,
  lastRunTunnels: 0,
  threads: 0,
  tunnels: 0,
  character: "remy",
  treats: 0,
  runTreats: 0,
  shield: 0,
  magnet: 0,
  frenzy: 0,
  boost: 0,
  canRevive: false,
  reviveCost: 40,
  biome: "park",
  missions: [],
};

function formatScore(n: number) {
  return n.toLocaleString("en-US");
}

function AuthChip() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="size-10 animate-pulse rounded-full bg-elevated" />;
  }
  if (!user) {
    return (
      <Link
        to="/login"
        data-ui
        className="inline-flex h-10 items-center rounded-full border border-border bg-surface/90 px-3 text-xs font-medium text-muted backdrop-blur-sm"
      >
        Sign in
      </Link>
    );
  }
  const label = user.displayName ?? user.primaryEmail ?? "Runner";
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface/90 py-1 pr-2 pl-1 backdrop-blur-sm">
      {user.profileImageUrl ? (
        <img src={user.profileImageUrl} alt="" className="size-8 rounded-full object-cover" />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-elevated text-xs font-medium">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="hidden max-w-24 truncate text-xs text-fg sm:inline">{label}</span>
      <button
        type="button"
        data-ui
        onClick={(e) => {
          e.stopPropagation();
          void signOut();
        }}
        className="pr-1 text-xs text-muted"
      >
        Out
      </button>
    </div>
  );
}

function holdHandlers(
  start: () => void,
  end: () => void,
): {
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onPointerUp: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: PointerEventHandler<HTMLButtonElement>;
} {
  return {
    onPointerDown: (e) => {
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      start();
    },
    onPointerUp: (e) => {
      e.stopPropagation();
      end();
    },
    onPointerCancel: () => end(),
  };
}

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<PacklineGame | null>(null);
  const [hud, setHud] = useState<HudState>(idleHud);
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new PacklineGame(canvas, setHud);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const playing = hud.phase === "playing";
  const overlay: Phase = hud.phase;
  const dog = DOGS[hud.character];
  const menu = overlay === "title" || overlay === "boot" || overlay === "gameover";

  function playDog(id: DogId, e?: SyntheticEvent) {
    e?.stopPropagation();
    const game = gameRef.current;
    if (!game) return;
    game.setCharacter(id);
    game.startFromTitle();
  }

  function runAgain(e?: SyntheticEvent) {
    e?.stopPropagation();
    gameRef.current?.restart();
  }

  function tryRevive(e?: SyntheticEvent) {
    e?.stopPropagation();
    gameRef.current?.revive();
  }

  function shareRun() {
    const text = `${dog.name} ran ${formatScore(hud.score)} on Packline`;
    if (navigator.share) {
      void navigator.share({ title: "Packline", text }).catch(() => {});
    } else if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  }

  const jumpHold = holdHandlers(
    () => gameRef.current?.requestJump(),
    () => gameRef.current?.releaseJump(),
  );
  const slideHold = holdHandlers(
    () => gameRef.current?.requestSlide(),
    () => gameRef.current?.releaseSlide(),
  );

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-bg text-fg">
      <div className="relative min-h-0 flex-1 px-3 pt-[max(0.65rem,env(safe-area-inset-top))] pb-2">
        <div className="relative h-full overflow-hidden rounded-lg">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-0 h-full w-full touch-none"
            aria-label="Packline endless runner"
          />

          {!intro ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-3 pt-3 [text-shadow:0_1px_10px_rgba(20,28,16,0.7)]">
            <div className="flex flex-col gap-0.5">
              <p className="font-display text-[10px] tracking-[0.28em] text-muted uppercase">Packline</p>
              <p className="font-mono text-3xl leading-none font-semibold tabular-nums">
                {formatScore(playing || overlay === "dying" || overlay === "gameover" ? hud.score : hud.highScore)}
              </p>
              <p className="text-xs text-muted">
                {playing ? (
                  <>
                    {dog.name}
                    {hud.combo >= 2 ? <span className="ml-2 text-accent tabular-nums">x{hud.combo}</span> : null}
                    {hud.runTreats > 0 ? <span className="ml-2 tabular-nums">{hud.runTreats} treats</span> : null}
                  </>
                ) : (
                  <>Best · {hud.treats} treats</>
                )}
              </p>
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              {menu ? <AuthChip /> : null}
              <Button
                type="button"
                data-ui
                variant="secondary"
                size="icon"
                className="size-11 bg-surface/90 backdrop-blur-sm"
                aria-label={hud.muted ? "Unmute" : "Mute"}
                onClick={(e) => {
                  e.stopPropagation();
                  gameRef.current?.toggleMute();
                }}
              >
                {hud.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </Button>
            </div>
          </div>
          ) : null}

          {playing ? (
            <div className="pointer-events-none absolute top-16 right-3 z-20 flex flex-col items-end gap-1">
              {hud.shield > 0 ? (
                <span className="rounded-full bg-surface/80 px-2 py-0.5 text-[10px] tracking-wide text-accent uppercase">
                  Shield {Math.ceil(hud.shield)}
                </span>
              ) : null}
              {hud.magnet > 0 ? (
                <span className="rounded-full bg-surface/80 px-2 py-0.5 text-[10px] tracking-wide text-accent uppercase">
                  Magnet {Math.ceil(hud.magnet)}
                </span>
              ) : null}
              {hud.frenzy > 0 ? (
                <span className="rounded-full bg-surface/80 px-2 py-0.5 text-[10px] tracking-wide text-danger uppercase">
                  Frenzy {Math.ceil(hud.frenzy)}
                </span>
              ) : null}
              {hud.boost > 0 ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] tracking-wide text-accent-fg uppercase">
                  Star {Math.ceil(hud.boost)}
                </span>
              ) : null}
            </div>
          ) : null}

          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-10 h-1 origin-left bg-accent",
              playing ? "opacity-80" : "opacity-0",
            )}
            style={{ transform: `scaleX(${Math.min(1, hud.distance / 2400)})` }}
          />

          {!intro && (overlay === "title" || overlay === "boot") ? (
            <div
              data-ui
              className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg via-bg/90 to-transparent px-4 pt-8 pb-4"
            >
              <p className="text-center text-[10px] tracking-[0.32em] text-muted uppercase">Daily park</p>
              <h1 className="font-display text-center text-4xl leading-none font-extrabold tracking-tight">Packline</h1>
              <p className="mt-1 text-center text-sm text-muted">Tap a dog. Chain hoops. Bank treats.</p>
              {hud.missions.length > 0 ? (
                <ul className="mx-auto mt-3 grid max-w-md grid-cols-3 gap-1.5">
                  {hud.missions.map((m) => (
                    <li
                      key={m.id}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs",
                        m.done ? "border-accent/50 bg-elevated text-accent" : "border-border bg-surface/80 text-muted",
                      )}
                    >
                      <p className="truncate font-medium text-fg">{m.label}</p>
                      <p className="tabular-nums">
                        {m.progress}/{m.goal}
                        {m.done ? " done" : ` · +${m.reward}`}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mx-auto mt-3 grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
                {DOG_IDS.map((id) => {
                  const d = DOGS[id];
                  const selected = hud.character === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-ui
                      onPointerDown={(e) => playDog(id, e)}
                      onClick={(e) => playDog(id, e)}
                      className={cn(
                        "min-h-[5.5rem] rounded-lg border bg-bg/80 px-1 py-1.5 backdrop-blur-sm",
                        selected ? "border-accent bg-elevated" : "border-border",
                      )}
                    >
                      <img
                        src={`/sprites/${id}/run-1.png?v=bandana`}
                        alt=""
                        draggable={false}
                        className="pointer-events-none mx-auto h-11 w-11 object-contain"
                      />
                      <p className="mt-1 text-center text-sm font-medium">{d.name}</p>
                      <p className="text-center text-[10px] text-accent">{d.blurb}</p>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                data-ui
                size="lg"
                className="mx-auto mt-3 flex h-14 w-full max-w-md text-base"
                onPointerDown={(e) => playDog(hud.character, e)}
                onClick={(e) => playDog(hud.character, e)}
              >
                Run {dog.name}
              </Button>
              <p className="mt-2 text-center text-xs text-subtle">Jump · Slide · Shield · Magnet · Frenzy</p>
            </div>
          ) : null}

          {overlay === "gameover" ? (
            <div
              data-ui
              className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg via-bg/96 to-transparent px-4 pt-16 pb-4"
            >
              <p className="text-[10px] tracking-[0.28em] text-muted uppercase">{dog.name} wiped out</p>
              <p className="font-display mt-1 text-5xl leading-none font-extrabold tabular-nums">{formatScore(hud.score)}</p>
              {hud.newBest ? <p className="mt-1 text-sm text-accent">New best</p> : null}
              <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
                <div className="rounded-md bg-elevated/90 px-2 py-2">
                  <dt className="text-[10px] text-muted">Combo</dt>
                  <dd className="font-mono tabular-nums">x{hud.lastRunCombo}</dd>
                </div>
                <div className="rounded-md bg-elevated/90 px-2 py-2">
                  <dt className="text-[10px] text-muted">Treats</dt>
                  <dd className="font-mono text-xs tabular-nums">+{hud.runTreats}</dd>
                </div>
                <div className="rounded-md bg-elevated/90 px-2 py-2">
                  <dt className="text-[10px] text-muted">Hoops</dt>
                  <dd className="font-mono tabular-nums">{hud.lastRunThreads}</dd>
                </div>
                <div className="rounded-md bg-elevated/90 px-2 py-2">
                  <dt className="text-[10px] text-muted">Tunnels</dt>
                  <dd className="font-mono tabular-nums">{hud.lastRunTunnels}</dd>
                </div>
              </dl>
              {hud.canRevive ? (
                <Button type="button" data-ui size="lg" className="mt-3 h-14 w-full text-base" onPointerDown={tryRevive} onClick={tryRevive}>
                  <Heart className="size-4" />
                  Continue · {hud.reviveCost} treats
                </Button>
              ) : null}
              <Button
                type="button"
                data-ui
                size="lg"
                variant={hud.canRevive ? "secondary" : "primary"}
                className="mt-2 h-14 w-full text-base"
                onPointerDown={runAgain}
                onClick={runAgain}
              >
                <RotateCcw className="size-4" />
                Run again
              </Button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  data-ui
                  variant="secondary"
                  className="h-12"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    gameRef.current?.returnToTitle();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    gameRef.current?.returnToTitle();
                  }}
                >
                  Switch dog
                </Button>
                <Button type="button" data-ui variant="secondary" className="h-12" onClick={shareRun}>
                  <Share2 className="size-4" />
                  Share
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {intro ? <BootIntro ready={hud.ready} onDone={() => setIntro(false)} /> : null}

      {playing || overlay === "dying" ? (
        <div
          data-ui
          className="grid shrink-0 grid-cols-2 gap-3 px-3 pt-1 pb-[max(0.85rem,env(safe-area-inset-bottom))]"
        >
          <button
            type="button"
            data-ui
            aria-label="Jump"
            className="flex h-16 items-center justify-center gap-2 rounded-lg border border-border bg-elevated text-base font-semibold"
            {...jumpHold}
          >
            <ChevronsUp className="size-6" />
            Jump
          </button>
          <button
            type="button"
            data-ui
            aria-label="Slide"
            className="flex h-16 items-center justify-center gap-2 rounded-lg bg-accent text-base font-semibold text-accent-fg"
            {...slideHold}
          >
            <ChevronsDown className="size-6" />
            Slide
          </button>
        </div>
      ) : null}
    </div>
  );
}
