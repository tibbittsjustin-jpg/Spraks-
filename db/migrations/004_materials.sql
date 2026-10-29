alter table activities add column if not exists materials text[] not null default '{}';
