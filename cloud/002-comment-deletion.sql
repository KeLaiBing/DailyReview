-- Run via WorkBuddy only after the shared comment tables exist.
BEGIN;
ALTER TABLE public.shared_comment_threads ADD COLUMN IF NOT EXISTS deleted_at BIGINT NULL;
ALTER TABLE public.shared_comment_replies ADD COLUMN IF NOT EXISTS deleted_at BIGINT NULL;
CREATE OR REPLACE FUNCTION public.shared_delete_comment(p_kind TEXT, p_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid TEXT; v_now BIGINT;
BEGIN
  IF p_kind IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'kind and id are required'; END IF;
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN false; END IF;
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  IF p_kind = 'thread' THEN
    IF NOT EXISTS (SELECT 1 FROM public.shared_comment_threads WHERE id = p_id AND owner_id = v_uid) THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM public.shared_comment_threads WHERE id = p_id AND owner_id = v_uid AND deleted_at IS NOT NULL) THEN RETURN true; END IF;
    UPDATE public.shared_comment_threads
       SET body='[已删除]', deleted_at=v_now, quote='[已删除]', prefix='', suffix=''
     WHERE id = p_id AND owner_id = v_uid AND deleted_at IS NULL;
    RETURN true;
  ELSIF p_kind = 'reply' THEN
    IF NOT EXISTS (SELECT 1 FROM public.shared_comment_replies WHERE id = p_id AND owner_id = v_uid) THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM public.shared_comment_replies WHERE id = p_id AND owner_id = v_uid AND deleted_at IS NOT NULL) THEN RETURN true; END IF;
    UPDATE public.shared_comment_replies SET body='[已删除]', deleted_at=v_now
     WHERE id = p_id AND owner_id = v_uid AND deleted_at IS NULL;
    RETURN true;
  ELSE
    RAISE EXCEPTION 'invalid kind';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.shared_delete_comment(TEXT,TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shared_delete_comment(TEXT,TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.shared_delete_comment(TEXT,TEXT) TO authenticated;
COMMIT;
