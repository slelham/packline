import { createServerFn } from "@tanstack/react-start";
import { isDogId, type DogId } from "@/game/characters";

export type BoardRow = {
  name: string;
  dog: DogId;
  score: number;
};

function cleanName(raw: string) {
  const n = raw.replace(/[^\p{L}\p{N} '\-.]/gu, "").replace(/\s+/g, " ").trim();
  return n.slice(0, 16);
}

async function topBoard() {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ name: string; dog: string; score: number }>`
    select name, dog, score
    from pack_scores
    order by score desc, created_at asc
    limit 20
  `;
  return rows
    .filter((r) => isDogId(r.dog) && Number.isFinite(Number(r.score)))
    .map((r) => ({
      name: r.name,
      dog: r.dog as DogId,
      score: Math.max(0, Math.floor(Number(r.score))),
    }));
}

export const listScores = createServerFn({ method: "GET" }).handler(async () => topBoard());

export const submitScore = createServerFn({ method: "POST" })
  .validator((d: { name: string; dog: string; score: number }) => d)
  .handler(async ({ data }) => {
    const name = cleanName(String(data?.name ?? ""));
    const dog = isDogId(data?.dog) ? data.dog : null;
    const score = Math.floor(Number(data?.score));
    if (!name || !dog || !Number.isFinite(score) || score < 1 || score > 50000) {
      return { ok: false as const, error: "Need a name and a treat score." };
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const existing = await sql<{ id: number; score: number }>`
      select id, score from pack_scores
      where lower(name) = ${name.toLowerCase()} and dog = ${dog}
      limit 1
    `;
    const row = existing[0];
    if (row) {
      if (score > Number(row.score)) {
        await sql`update pack_scores set score = ${score}, created_at = now() where id = ${row.id}`;
      }
    } else {
      await sql`insert into pack_scores (name, dog, score) values (${name}, ${dog}, ${score})`;
    }
    return { ok: true as const, name, board: await topBoard() };
  });
