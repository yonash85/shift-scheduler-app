-- Draft/publish workflow: admin can generate and edit a schedule privately, then
-- reveal it to the team with an explicit action. Existing rows default to true so
-- the schedule your team can already see today doesn't disappear on you.
alter table schedules add column published boolean not null default true;
