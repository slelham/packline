import { DOGS, type DogId } from "@/game/characters";
import { cn } from "@/lib/utils";
import type { BoardRow } from "@/lib/scores";

export function PackBoard({
  rows,
  compact,
}: {
  rows: BoardRow[];
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-center text-xs text-muted">Park board is empty. First treat run owns it.</p>;
  }
  const list = compact ? rows.slice(0, 5) : rows.slice(0, 12);
  return (
    <ol className={cn("mx-auto w-full max-w-md", compact ? "space-y-0.5" : "space-y-1")}>
      {list.map((r, i) => (
        <li
          key={`${r.name}-${r.dog}-${i}`}
          className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 rounded-md bg-elevated/80 px-2 py-1 text-sm"
        >
          <span className="font-mono text-xs text-muted tabular-nums">{i + 1}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <img
              src={`/sprites/${r.dog}/run-1.png?v=bandana`}
              alt=""
              className="h-6 w-6 object-contain"
            />
            <span className="truncate font-medium">{r.name}</span>
            <span className="truncate text-[10px] text-muted">{DOGS[r.dog as DogId]?.name}</span>
          </span>
          <span className="font-mono text-accent tabular-nums">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}
