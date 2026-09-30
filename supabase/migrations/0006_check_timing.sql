-- How long each check took (model call start to result), for speed tracking.
-- Additive only: nullable column, existing rows untouched.
alter table public.reviews add column if not exists duration_ms integer check (duration_ms is null or duration_ms >= 0);
