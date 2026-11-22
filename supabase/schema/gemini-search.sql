alter table public.knowledge_chunks add column if not exists embedding_gemini_768 vector(768);
alter table public.knowledge_chunks add column if not exists embedding_gemini_content_hash text;
comment on column public.knowledge_chunks.embedding_gemini_768 is 'gemini-embedding-001; RETRIEVAL_DOCUMENT; outputDimensionality=768. Do not mix models.';
create or replace function public.search_knowledge_gemini(query_embedding vector, match_count integer default 8, doc_type_filter text default null)
returns table(chunk_id bigint, document_id uuid, title text, doc_type text, heading text, page_from integer, page_to integer, content text, distance double precision)
language plpgsql stable security invoker set search_path = public, extensions
as $$
begin
  if query_embedding is null or vector_dims(query_embedding) <> 768 or vector_norm(query_embedding) = 0 then
    raise exception 'Expected nonzero Gemini embedding with 768 dimensions';
  end if;
  return query
  select kc.id,kc.document_id,kd.title,kd.doc_type,kc.heading,kc.page_from,kc.page_to,kc.content,
    (kc.embedding_gemini_768 <=> query_embedding)::double precision
  from public.knowledge_chunks kc join public.knowledge_documents kd on kd.id=kc.document_id
  where kc.embedding_gemini_768 is not null
    and kc.embedding_gemini_content_hash = md5(kc.content)
    and (doc_type_filter is null or kd.doc_type=doc_type_filter)
  order by kc.embedding_gemini_768 <=> query_embedding
  limit greatest(1,least(coalesce(match_count,8),50));
end; $$;
revoke all on function public.search_knowledge_gemini(vector,integer,text) from public,anon;
grant execute on function public.search_knowledge_gemini(vector,integer,text) to authenticated,service_role;

-- Apply this compatibility alias only after re-embedding and deploying embed-search with Gemini.
create or replace function public.search_knowledge(query_embedding vector, match_count integer default 8, doc_type_filter text default null)
returns table(chunk_id bigint,document_id uuid,title text,doc_type text,heading text,page_from integer,page_to integer,content text,distance double precision)
language sql stable security invoker set search_path=public,extensions as $$
 select * from public.search_knowledge_gemini(query_embedding,match_count,doc_type_filter);
$$;
revoke all on function public.search_knowledge(vector,integer,text) from public,anon;
grant execute on function public.search_knowledge(vector,integer,text) to authenticated,service_role;
