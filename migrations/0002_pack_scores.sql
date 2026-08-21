create table if not exists pack_scores (
  id         serial primary key,
  name       text not null,
  dog        text not null,
  score      integer not null,
  created_at timestamptz not null default now()
);

create unique index if not exists pack_scores_name_dog
  on pack_scores (lower(name), dog);

create index if not exists pack_scores_score_idx
  on pack_scores (score desc, id asc);
