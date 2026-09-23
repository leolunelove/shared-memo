-- 1. Create the sole owner in Supabase Authentication > Users (without an invitation).
-- 2. Replace OWNER_EMAIL_HERE with that user's email, then run this SQL once.
-- The live board starts empty. Example tasks exist only in /preview.
do $$ declare owner_uuid uuid; begin
 select id into owner_uuid from auth.users where lower(email)=lower('OWNER_EMAIL_HERE');
 if owner_uuid is null then raise exception 'Create the owner user first';end if;
 insert into public.boards(title,owner_id) values ('LEO × JAMES',owner_uuid);
end $$;
