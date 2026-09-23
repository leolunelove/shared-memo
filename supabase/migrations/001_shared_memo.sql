-- No anonymous access to tables. The viewer has exactly one read-only function.
create table public.boards (
 id uuid primary key default gen_random_uuid(),
 singleton boolean not null default true unique check (singleton),
 title text not null default 'LEO × JAMES' check (char_length(title) between 1 and 100),
 owner_id uuid not null references auth.users(id),
 viewer_token_hash text check (viewer_token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(),
 board_id uuid not null references public.boards(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 240),
 note text not null default '' check (char_length(note)<=400),
 status text not null default 'pending' check (status in ('pending','waiting','done')),
 assigned_to text check (assigned_to in ('Leo','James')),
 sort_order bigint not null default 0 check(sort_order>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz
);
create index tasks_board_order on public.tasks(board_id,status,sort_order);
alter table public.boards enable row level security;
alter table public.tasks enable row level security;
revoke all on public.boards,public.tasks from anon,authenticated;
grant select on public.boards to authenticated;
grant update(title,viewer_token_hash) on public.boards to authenticated;
grant select,delete on public.tasks to authenticated;
grant insert(id,board_id,title,note,status,assigned_to,sort_order) on public.tasks to authenticated;
grant update(title,note,status,assigned_to,sort_order) on public.tasks to authenticated;
create policy owner_read_board on public.boards for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_edit_board on public.boards for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy owner_read_tasks on public.tasks for select to authenticated using(exists(select 1 from public.boards b where b.id=board_id and b.owner_id=(select auth.uid())));
create policy owner_add_tasks on public.tasks for insert to authenticated with check(exists(select 1 from public.boards b where b.id=board_id and b.owner_id=(select auth.uid())));
create policy owner_edit_tasks on public.tasks for update to authenticated using(exists(select 1 from public.boards b where b.id=board_id and b.owner_id=(select auth.uid()))) with check(exists(select 1 from public.boards b where b.id=board_id and b.owner_id=(select auth.uid())));
create policy owner_delete_tasks on public.tasks for delete to authenticated using(exists(select 1 from public.boards b where b.id=board_id and b.owner_id=(select auth.uid())));
create function public.stamp_board() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=clock_timestamp();return new;end;$$;
create trigger stamp_board before update on public.boards for each row execute function public.stamp_board();
create function public.stamp_task() returns trigger language plpgsql set search_path='' as $$begin
 new.updated_at=clock_timestamp();
 if new.status='done' then
  if tg_op='INSERT' then new.completed_at=clock_timestamp();
  elsif old.status<>'done' then new.completed_at=clock_timestamp();
  else new.completed_at=old.completed_at;end if;
 else new.completed_at=null;end if;
 return new;end;$$;
create trigger stamp_task before insert or update on public.tasks for each row execute function public.stamp_task();
create function public.touch_board() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' then update public.boards set updated_at=clock_timestamp() where id=old.board_id;return old;
 else update public.boards set updated_at=clock_timestamp() where id=new.board_id;return new;end if;end;$$;
create trigger touch_board after insert or update or delete on public.tasks for each row execute function public.touch_board();
revoke all on function public.stamp_board(),public.stamp_task(),public.touch_board() from public,anon,authenticated;
create function public.read_shared_board(viewer_token text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',b.id,'title',b.title,'updated_at',b.updated_at,'tasks',coalesce((
  select jsonb_agg(jsonb_build_object('id',t.id,'board_id',t.board_id,'title',t.title,'note',t.note,'status',t.status,'assigned_to',t.assigned_to,'sort_order',t.sort_order,'created_at',t.created_at,'updated_at',t.updated_at,'completed_at',t.completed_at) order by t.sort_order,t.created_at) from public.tasks t where t.board_id=b.id and not (t.status='done' and t.completed_at<=now()-interval '24 hours')
 ),'[]'::jsonb)) from public.boards b
 where viewer_token ~ '^[A-Za-z0-9_-]{43}$' and b.viewer_token_hash=encode(sha256(convert_to(viewer_token,'UTF8')),'hex');
$$;
revoke all on function public.read_shared_board(text) from public;
grant execute on function public.read_shared_board(text) to anon,authenticated;
create function public.reorder_tasks(target_board uuid,items jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare requested integer;matched integer;begin
 if not exists(select 1 from public.boards where id=target_board and owner_id=(select auth.uid())) then raise exception 'Not authorized';end if;
 if jsonb_typeof(items)<>'array' then raise exception 'Invalid order';end if;
 requested=jsonb_array_length(items);
 if requested<1 or requested>200 then raise exception 'Invalid order';end if;
 select count(distinct t.id) into matched from public.tasks t join jsonb_to_recordset(items) as x(id uuid,status text,sort_order bigint) on t.id=x.id where t.board_id=target_board;
 if matched<>requested then raise exception 'Invalid items';end if;
 update public.tasks t set status=x.status,sort_order=x.sort_order from jsonb_to_recordset(items) as x(id uuid,status text,sort_order bigint) where t.id=x.id and t.board_id=target_board;
end;$$;
revoke all on function public.reorder_tasks(uuid,jsonb) from public,anon;
grant execute on function public.reorder_tasks(uuid,jsonb) to authenticated;
