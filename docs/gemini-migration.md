# Gemini 자료 검색 운영

검색어와 자료 본문 모두 gemini-embedding-001의 768차원 벡터를 사용합니다. 검색어는 RETRIEVAL_QUERY, 본문은 RETRIEVAL_DOCUMENT로 임베딩합니다. 기존 4096차원 벡터는 복구용으로 보존하며 새 검색에서는 사용하지 않습니다.

## 구성

- supabase/functions/embed-search-gemini/index.ts: 서버의 GEMINI_API_KEY로 검색어 임베딩. 로그인 및 승인 회원 여부를 확인합니다. 키를 HTML이나 저장소에 넣지 않습니다.
- supabase/schema/gemini-search.sql: 별도 벡터 컬럼과 search_knowledge_gemini 함수. 기존 자료 테이블 RLS를 적용하고 비회원 실행을 차단합니다.
- 본문 MD5를 저장하여 변경된 본문의 오래된 벡터는 검색에서 제외합니다. MD5는 변경 감지용이며 인증용이 아닙니다.
- 생성용 AI와 개인 API 키 설정은 유지합니다. Gemini가 기본값이며 자료 검색은 생성용 AI 선택과 무관하게 Gemini를 사용합니다.

## 새 자료 추가·본문 수정 후

관리자 환경에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY 환경 변수를 설정하고 실행합니다. 값은 코드나 명령 기록에 붙여넣지 마세요.

```sh
node scripts/reembed-gemini.mjs
```

처리한 자료는 건너뛰고 신규·수정 자료만 처리합니다. 본문이 동시에 수정되면 이전 본문으로 만든 벡터를 저장하지 않습니다. 이 경우 다시 실행하세요. 모델 변경 시에는 새 컬럼을 만들고 전체 자료를 재임베딩해야 합니다.

## 검증

```sh
node tests/gemini.cjs
```

모의 테스트는 인증, 회원 권한, 요청 형식, 벡터 차원, 오류 처리와 화면 JavaScript 문법을 검사합니다. 운영 배포는 전체 자료의 Gemini 벡터 생성, 검색 결과, 문서유형 필터, 비회원 접근 차단을 확인한 뒤 진행합니다.

모델 API: https://ai.google.dev/gemini-api/docs/embeddings
