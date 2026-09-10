-- Forward compatibility for hosted Storage permission probes. No data writes.
begin;
create or replace function public.upload_object_arrived() returns trigger language plpgsql security definer set search_path='' as $$
declare i public.upload_intents;begin
 -- Hosted Storage probes now include contentLength/mimetype without final size.
 -- Probes roll back; never consume the intent before final object metadata exists.
 -- Claim still requires exact final size/MIME and the server verifies the bytes.
 if new.metadata is null or not (new.metadata ? 'size') then return new;end if;
 if new.name like 'uploads/%' then
  select * into i from public.upload_intents where bucket=new.bucket_id and file_path=new.name;
  if not found or i.expires_at<=now() or i.status not in('created','uploading') or (new.metadata->>'size')::bigint is distinct from i.byte_size or new.metadata->>'mimetype' is distinct from i.mime_type then raise exception 'Upload object does not match its intent';end if;
  update public.upload_intents set status='uploaded' where id=i.id;
 end if;
 return new;
end $$;
commit;
