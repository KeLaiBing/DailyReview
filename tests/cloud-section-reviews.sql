DO $test$
DECLARE s text:='核对24条记录，发现单位错误；原因是复制时未复核，明早9点逐条验证，24条一致为通过。';
r jsonb; a jsonb; b jsonb; n int;
BEGIN
r:=jsonb_build_object('summary','记录具体，下一步可验收','dimensions',jsonb_build_object(
'specificity',jsonb_build_object('score',4,'reason','有24条记录','evidence',jsonb_build_array('核对24条记录')),
'reflection',jsonb_build_object('score',4,'reason','说明原因','evidence',jsonb_build_array('原因是复制时未复核')),
'action',jsonb_build_object('score',4,'reason','有时间与标准','evidence',jsonb_build_array('明早9点逐条验证，24条一致为通过'))),'suggestions',jsonb_build_array('保留验证结果'));
BEGIN
SET LOCAL ROLE authenticated;
PERFORM set_config('request.jwt.claim.sub','heading-test-user',true);
INSERT INTO public.shared_documents(id,title,owner_id,date,html,created,updated,rev)
VALUES('heading-test-doc','synthetic','heading-test-user','2025-01-01','<h1 data-journal-id="first">甲</h1><p>记录</p><h1 data-journal-id="second">乙</h1><p>记录</p>',0,0,1);
a:=public.shared_save_section_review('heading-test-doc','first','甲','2025-01-01',1,s,r,'synthetic');
IF a->'review'->>'section_id'<>'first' OR a->'review'->'review' IS DISTINCT FROM r THEN RAISE EXCEPTION 'FAIL first save'; END IF;
b:=public.shared_save_section_review('heading-test-doc','second','乙','2025-01-01',1,s,r,'synthetic');
IF b->'review'->>'section_id'<>'second' OR (b->>'qualified_days')::int<>1 THEN RAISE EXCEPTION 'FAIL section/date isolation'; END IF;
b:=public.shared_save_section_review('heading-test-doc','first','改名','2025-01-01',1,s,r,'synthetic');
IF b->'review'->>'section_id'<>'first' THEN RAISE EXCEPTION 'FAIL idempotence'; END IF;
b:=public.shared_save_section_review('heading-test-doc','first','改名','2025-01-01',1,s,r,'other-model');
IF b->'review'->>'model'<>'other-model' THEN RAISE EXCEPTION 'FAIL model switch'; END IF;
r:=jsonb_set(r,'{format_version}','2');
b:=public.shared_save_section_review('heading-test-doc','first','甲','2025-01-01',1,s,r,'other-model');
IF b->'review'->'review'->>'format_version'<>'2' THEN RAISE EXCEPTION 'FAIL prompt version refresh'; END IF;
SELECT count(*) INTO n FROM public.shared_section_reviews WHERE document_id='heading-test-doc';
IF n<>2 THEN RAISE EXCEPTION 'FAIL duplicate count'; END IF;
BEGIN PERFORM public.shared_save_section_review('heading-test-doc','first','甲','2025-01-02',1,s,r,'synthetic'); RAISE EXCEPTION 'FAIL mutable statistics date';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'statistics_date_locked' THEN RAISE; END IF; END;
BEGIN PERFORM public.shared_save_section_review('heading-test-doc','missing','甲','2025-01-01',1,s,r,'synthetic'); RAISE EXCEPTION 'FAIL missing heading';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'section not found' THEN RAISE; END IF; END;
BEGIN PERFORM public.shared_save_section_review('heading-test-doc','first','甲','2025-01-01',0,s,r,'synthetic'); RAISE EXCEPTION 'FAIL stale rev';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'stale_document' THEN RAISE; END IF; END;
BEGIN INSERT INTO public.shared_section_quality VALUES('heading-test-doc','forged','2025-01-01',ARRAY['action'],0); RAISE EXCEPTION 'FAIL direct write';
EXCEPTION WHEN insufficient_privilege THEN NULL; END;
SET LOCAL ROLE anon;
PERFORM set_config('request.jwt.claim.sub','',true);
BEGIN PERFORM public.shared_save_section_review('heading-test-doc','first','甲','2025-01-01',1,s,r,'synthetic'); RAISE EXCEPTION 'FAIL anon RPC';
EXCEPTION WHEN insufficient_privilege THEN NULL; END;
RAISE EXCEPTION 'HEADING_TEST_SUCCESS_ROLLBACK';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'HEADING_TEST_SUCCESS_ROLLBACK' THEN RAISE; END IF;
END;
IF EXISTS(SELECT 1 FROM public.shared_documents WHERE id='heading-test-doc') THEN RAISE EXCEPTION 'FAIL rollback'; END IF;
RAISE NOTICE 'HEADING_TEST_PASSED_AND_ROLLED_BACK';
END $test$;
