-- Explicit member binding; creator owner_id stays unchanged. Legacy docs remain unbound until confirmed.
-- For a SQL client that supports batches, run this transaction as written.
-- WorkBuddy db_exec_sql accepts one statement per call: apply and verify each DDL/DCL
-- separately in migrate mode; do not send BEGIN/COMMIT in separate tool calls.
BEGIN;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS member_id TEXT REFERENCES public.shared_profiles(owner_id);
CREATE INDEX IF NOT EXISTS shared_documents_member_id_idx ON public.shared_documents(member_id);
-- Changing model may replace the daily review; earned criteria remain a union per day.
CREATE OR REPLACE FUNCTION public.shared_save_daily_review(
  p_document_id TEXT,
  p_date DATE,
  p_source_rev INT,
  p_source_text TEXT,
  p_review JSONB,
  p_model TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid TEXT;
  v_doc_rev INT;
  v_doc_id TEXT;
  v_now BIGINT;
  v_existing JSONB;
  v_score_spec INT; v_score_ref INT; v_score_act INT;
  v_reason_spec TEXT; v_reason_ref TEXT; v_reason_act TEXT;
  v_evidence_spec JSONB; v_evidence_ref JSONB; v_evidence_act JSONB;
  v_summary TEXT;
  v_suggestions JSONB;
  v_qualified BOOLEAN;
  v_criteria TEXT[] := '{}'::TEXT[];
  v_qualified_days INT;
  v_earned TEXT[] := '{}'::TEXT[];
  v_ev_item JSONB;
  v_rev JSONB;
  v_key TEXT; v_dimension JSONB; v_score JSONB;
BEGIN
  -- 身份
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 基础参数
  IF p_document_id IS NULL OR p_date IS NULL OR p_source_rev IS NULL
     OR p_source_text IS NULL OR p_review IS NULL OR p_model IS NULL THEN
    RAISE EXCEPTION 'invalid arguments';
  END IF;

  -- 日期必须等于今天（Asia/Shanghai）
  IF p_date <> ((clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date) THEN
    RAISE EXCEPTION 'review_date must be today';
  END IF;

  IF btrim(p_source_text) = '' OR length(p_source_text) > 20000 THEN
    RAISE EXCEPTION 'source_text empty or too long';
  END IF;

  IF btrim(p_model) = '' OR length(p_model) > 120 THEN
    RAISE EXCEPTION 'model invalid';
  END IF;

  -- review JSON 形状与字段
  IF jsonb_typeof(p_review) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_review->'summary') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'review and summary types invalid';
  END IF;
  v_summary := p_review->>'summary';
  IF v_summary IS NULL OR btrim(v_summary) = '' OR length(v_summary) > 1200 THEN
    RAISE EXCEPTION 'summary invalid';
  END IF;

  IF jsonb_typeof(p_review->'dimensions') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'dimensions must be object';
  END IF;

  -- ->> followed by ::INT accepts JSON strings such as "5". Check JSON type first.
  FOREACH v_key IN ARRAY ARRAY['specificity','reflection','action'] LOOP
    v_dimension := p_review->'dimensions'->v_key;
    v_score := v_dimension->'score';
    IF jsonb_typeof(v_dimension) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_score) IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_dimension->'reason') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'dimension types invalid';
    END IF;
    IF (v_score #>> '{}')::NUMERIC <> trunc((v_score #>> '{}')::NUMERIC)
       OR (v_score #>> '{}')::NUMERIC < 0 OR (v_score #>> '{}')::NUMERIC > 5 THEN
      RAISE EXCEPTION 'scores must be integers 0..5';
    END IF;
  END LOOP;
  v_score_spec := ((p_review->'dimensions'->'specificity'->>'score')::NUMERIC)::INT;
  v_score_ref  := ((p_review->'dimensions'->'reflection'->>'score')::NUMERIC)::INT;
  v_score_act  := ((p_review->'dimensions'->'action'->>'score')::NUMERIC)::INT;
  IF v_score_spec IS NULL OR v_score_ref IS NULL OR v_score_act IS NULL
     OR v_score_spec < 0 OR v_score_spec > 5
     OR v_score_ref  < 0 OR v_score_ref  > 5
     OR v_score_act  < 0 OR v_score_act  > 5 THEN
    RAISE EXCEPTION 'scores must be integers 0..5';
  END IF;

  v_reason_spec := p_review->'dimensions'->'specificity'->>'reason';
  v_reason_ref  := p_review->'dimensions'->'reflection'->>'reason';
  v_reason_act  := p_review->'dimensions'->'action'->>'reason';
  IF v_reason_spec IS NULL OR btrim(v_reason_spec) = '' OR length(v_reason_spec) > 600
     OR v_reason_ref IS NULL OR btrim(v_reason_ref) = '' OR length(v_reason_ref) > 600
     OR v_reason_act IS NULL OR btrim(v_reason_act) = '' OR length(v_reason_act) > 600 THEN
    RAISE EXCEPTION 'reasons must be non-empty and <=600';
  END IF;

  v_evidence_spec := p_review->'dimensions'->'specificity'->'evidence';
  v_evidence_ref  := p_review->'dimensions'->'reflection'->'evidence';
  v_evidence_act  := p_review->'dimensions'->'action'->'evidence';
  IF v_evidence_spec IS NULL OR jsonb_typeof(v_evidence_spec) IS DISTINCT FROM 'array'
     OR v_evidence_ref IS NULL OR jsonb_typeof(v_evidence_ref) IS DISTINCT FROM 'array'
     OR v_evidence_act IS NULL OR jsonb_typeof(v_evidence_act) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'evidence must be arrays';
  END IF;

  -- 每个 score>=3 的维度至少一条非空证据；证据 <=400 且存在于 source_text；最多3条
  IF v_score_spec >= 3 AND jsonb_array_length(v_evidence_spec) = 0 THEN RAISE EXCEPTION 'specificity needs evidence'; END IF;
  IF v_score_ref  >= 3 AND jsonb_array_length(v_evidence_ref)  = 0 THEN RAISE EXCEPTION 'reflection needs evidence'; END IF;
  IF v_score_act  >= 3 AND jsonb_array_length(v_evidence_act)  = 0 THEN RAISE EXCEPTION 'action needs evidence'; END IF;

  IF jsonb_array_length(v_evidence_spec) > 3 OR jsonb_array_length(v_evidence_ref) > 3 OR jsonb_array_length(v_evidence_act) > 3 THEN
    RAISE EXCEPTION 'evidence too many items';
  END IF;

  FOR v_ev_item IN SELECT jsonb_array_elements(v_evidence_spec) LOOP
    IF jsonb_typeof(v_ev_item) IS DISTINCT FROM 'string' OR v_ev_item #>> '{}' IS NULL
       OR v_ev_item #>> '{}' = '' OR length(v_ev_item #>> '{}') > 400
       OR position(v_ev_item #>> '{}' IN p_source_text) = 0 THEN
      RAISE EXCEPTION 'evidence not substring of source_text';
    END IF;
  END LOOP;
  FOR v_ev_item IN SELECT jsonb_array_elements(v_evidence_ref) LOOP
    IF jsonb_typeof(v_ev_item) IS DISTINCT FROM 'string' OR v_ev_item #>> '{}' IS NULL
       OR v_ev_item #>> '{}' = '' OR length(v_ev_item #>> '{}') > 400
       OR position(v_ev_item #>> '{}' IN p_source_text) = 0 THEN
      RAISE EXCEPTION 'evidence not substring of source_text';
    END IF;
  END LOOP;
  FOR v_ev_item IN SELECT jsonb_array_elements(v_evidence_act) LOOP
    IF jsonb_typeof(v_ev_item) IS DISTINCT FROM 'string' OR v_ev_item #>> '{}' IS NULL
       OR v_ev_item #>> '{}' = '' OR length(v_ev_item #>> '{}') > 400
       OR position(v_ev_item #>> '{}' IN p_source_text) = 0 THEN
      RAISE EXCEPTION 'evidence not substring of source_text';
    END IF;
  END LOOP;

  v_suggestions := p_review->'suggestions';
  IF v_suggestions IS NULL OR jsonb_typeof(v_suggestions) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_suggestions) < 1 OR jsonb_array_length(v_suggestions) > 3 THEN
    RAISE EXCEPTION 'suggestions must be 1..3 items';
  END IF;
  FOR v_ev_item IN SELECT jsonb_array_elements(v_suggestions) LOOP
    IF jsonb_typeof(v_ev_item) IS DISTINCT FROM 'string' OR v_ev_item #>> '{}' IS NULL
       OR v_ev_item #>> '{}' = '' OR length(v_ev_item #>> '{}') > 400 THEN
      RAISE EXCEPTION 'suggestion invalid';
    END IF;
  END LOOP;

  -- 文档行锁 + rev 校验
  SELECT rev, id INTO v_doc_rev, v_doc_id
    FROM public.shared_documents WHERE id = p_document_id FOR UPDATE;
  IF v_doc_id IS NULL THEN
    RAISE EXCEPTION 'document not found';
  END IF;
  IF v_doc_rev IS DISTINCT FROM p_source_rev THEN
    RAISE EXCEPTION 'stale_document';
  END IF;

  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;

  -- 幂等：同 document/date 且 source_text 相同 → 返回已存，不增长天数
  SELECT review INTO v_existing
    FROM public.shared_daily_reviews
   WHERE document_id = p_document_id AND review_date = p_date AND source_text = p_source_text AND model = p_model;
  IF v_existing IS NOT NULL THEN
    SELECT count(*) INTO v_qualified_days
      FROM public.shared_quality_days WHERE document_id = p_document_id;
    SELECT COALESCE(array_agg(c ORDER BY c), '{}'::TEXT[]) INTO v_earned
      FROM (SELECT DISTINCT unnest(criteria) AS c FROM public.shared_quality_days WHERE document_id = p_document_id) q;
    IF v_qualified_days >= 3  THEN v_earned := array_append(v_earned,'quality_3'); END IF;
    IF v_qualified_days >= 7  THEN v_earned := array_append(v_earned,'quality_7'); END IF;
    IF v_qualified_days >= 30 THEN v_earned := array_append(v_earned,'quality_30'); END IF;
    SELECT to_jsonb(r.*) INTO v_rev FROM public.shared_daily_reviews r
     WHERE r.document_id = p_document_id AND r.review_date = p_date;
    RETURN jsonb_build_object('review', v_rev, 'qualified_days', v_qualified_days, 'earned', v_earned);
  END IF;

  -- 判定优质（全部 >=3 且 sum >= 12）
  v_qualified := (v_score_spec >= 3 AND v_score_ref >= 3 AND v_score_act >= 3)
                 AND (v_score_spec + v_score_ref + v_score_act >= 12);

  -- criteria 仅由服务器按 score>=4 生成
  IF v_score_spec >= 4 THEN v_criteria := array_append(v_criteria,'specificity'); END IF;
  IF v_score_ref  >= 4 THEN v_criteria := array_append(v_criteria,'reflection'); END IF;
  IF v_score_act  >= 4 THEN v_criteria := array_append(v_criteria,'action'); END IF;

  -- 更新点评（覆盖当天最新，但保留已获奖励）
  INSERT INTO public.shared_daily_reviews
    (document_id, review_date, source_text, source_rev, review, model, reviewer_id, updated)
  VALUES
    (p_document_id, p_date, p_source_text, p_source_rev, p_review, p_model, v_uid, v_now)
  ON CONFLICT (document_id, review_date)
  DO UPDATE SET source_text = EXCLUDED.source_text,
                source_rev = EXCLUDED.source_rev,
                review = EXCLUDED.review,
                model = EXCLUDED.model,
                reviewer_id = EXCLUDED.reviewer_id,
                updated = EXCLUDED.updated;

  -- 优质天数：合并且不重复，保留首次 awarded_at
  IF v_qualified THEN
    INSERT INTO public.shared_quality_days (document_id, review_date, criteria, awarded_at)
    VALUES (p_document_id, p_date, v_criteria, v_now)
    ON CONFLICT (document_id, review_date)
    DO UPDATE SET criteria = (
      SELECT array_agg(DISTINCT x) FROM (
        SELECT unnest(public.shared_quality_days.criteria) AS x
        UNION SELECT unnest(EXCLUDED.criteria)
      ) s
    );
  END IF;

  -- 汇总
  SELECT count(*) INTO v_qualified_days
    FROM public.shared_quality_days WHERE document_id = p_document_id;
  SELECT COALESCE(array_agg(c ORDER BY c), '{}'::TEXT[]) INTO v_earned
    FROM (SELECT DISTINCT unnest(criteria) AS c FROM public.shared_quality_days WHERE document_id = p_document_id) q;
  IF v_qualified_days >= 3  THEN v_earned := array_append(v_earned,'quality_3'); END IF;
  IF v_qualified_days >= 7  THEN v_earned := array_append(v_earned,'quality_7'); END IF;
  IF v_qualified_days >= 30 THEN v_earned := array_append(v_earned,'quality_30'); END IF;

  SELECT to_jsonb(r.*) INTO v_rev FROM public.shared_daily_reviews r
   WHERE r.document_id = p_document_id AND r.review_date = p_date;

  RETURN jsonb_build_object(
    'review', v_rev,
    'qualified_days', v_qualified_days,
    'earned', v_earned
  );
END $$;

REVOKE ALL ON FUNCTION public.shared_save_daily_review(TEXT,DATE,INT,TEXT,JSONB,TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shared_save_daily_review(TEXT,DATE,INT,TEXT,JSONB,TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.shared_save_daily_review(TEXT,DATE,INT,TEXT,JSONB,TEXT) TO authenticated;

COMMIT;
