# SKTHON Backend

SKTHON 백엔드는 NestJS 기반 모듈러 모놀리스이며, 각 도메인 모듈에 StockForge의 헥사고날 아키텍처 구조를 적용한다.

## Requirements

- Node.js 22 LTS 이상
- Docker Desktop
- npm

## Local development

1. `infra/databases/.env.example`을 복사해 `infra/databases/.env`를 만들고 비밀번호를 설정한다.
2. PostGIS를 실행한다.

```bash
docker compose --env-file infra/databases/.env \
  -f infra/databases/docker-compose.yml up -d
```

3. 애플리케이션 환경 파일을 준비한다.

```bash
cp .env.example .env
npm install
npm run migration:run
npm run start:dev
```

## Empty database preprocessing seed

빈 PostGIS 데이터베이스를 원천 데이터부터 전처리 완료 상태까지 구성하려면
`backend/.env`의 DB 접속 정보를 준비한 뒤 다음 명령을 실행한다.

```bash
./infra/databases/bootstrap/bootstrap-preprocessed.sh
```

이 명령은 TypeORM migration, 원천 staging/transform, 업종 정규화,
100개 업종별 분석 프로파일, 건축물-상권 공간 조인, 경쟁도·수요도 계산 및
최종 검증을 순서대로 실행한다.
자세한 변경 내역과 재실행 주의사항은
[`docs/preprocessing-worklog.md`](docs/preprocessing-worklog.md)를 참고한다.

`.env`의 `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` 값은
`infra/databases/.env`의 `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`와
동일해야 한다.

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/health`

## 공간 분석 컨텍스트 (단계 1)

좌표에서 분석 대상 건물 후보를 찾고 사용자가 한 건물을 선택하는 API를 제공한다.
현재 인증 미들웨어가 연결되기 전 단계이므로 요청에는 내부 사용자 ID를
`X-User-Id` 헤더로 전달한다. 이 값은 임의의 숫자가 아니라 `users` 테이블에
동기화된 활성 내부 사용자 ID여야 한다. 존재하지 않으면 API는
`401 AUTHENTICATED_USER_NOT_FOUND`를 반환한다.

```bash
curl -X POST http://localhost:3000/api/v1/space-analysis-contexts \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: 1' \
  -d '{"longitude":127.0365,"latitude":37.5442}'

curl -X PUT http://localhost:3000/api/v1/space-analysis-contexts/<contextId>/building \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: 1' \
  -d '{"buildingId":"12345"}'

curl -X PUT http://localhost:3000/api/v1/space-analysis-contexts/<contextId>/space-detail/skip \
  -H 'X-User-Id: 1'
```

정확히 건물 안에 포함되는 후보를 먼저 찾고, 없을 때만 10m 이내 최근접 후보를
`matchType: "NEARBY"`로 반환한다. 초기 후보에 포함되지 않은 건물이나 다른
사용자의 컨텍스트는 선택할 수 없다. 건물 선택 뒤에는 건축물대장 `optionId`를
선택하거나 `source: "USER_INPUT"`으로 층·전용면적을 입력할 수 있다.

## 건물 위치 기반 업종 추천 (비동기/SSE)

건물 ID만으로 주변 상권·점포·성별·연령대·시간대 유동인구를 수집해 업종 TOP 5와
영업시간을 분석한다. 요청은 즉시 `202 Accepted`로 반환되고, SSE로 진행 상황을
구독한다. 현재 기본 agent mode는 외부 연동 없이 검증 가능한 `deterministic`이며,
OpenAI 분석을 사용할 때는 `.env`에서 `RECOMMENDATION_AGENT_MODE=openai`와
`OPENAI_API_KEY`를 설정한다. `RECOMMENDATION_MCP_SERVER_URL`은 선택 사항이며,
설정하면 AI가 원격 MCP 도구도 추가로 사용할 수 있다. 설정하지 않아도 백엔드가
수집한 evidence packet만으로 분석한다.

```bash
curl -X POST http://localhost:3000/api/v1/buildings/<buildingId>/recommendation-requests \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: <users.id>' \
  -H 'Idempotency-Key: <uuid>' \
  -d '{}'

curl -N http://localhost:3000/api/v1/recommendation-requests/<requestId>/events \
  -H 'X-User-Id: <users.id>' \
  -H 'Last-Event-ID: 0'

curl http://localhost:3000/api/v1/recommendation-requests/<requestId> \
  -H 'X-User-Id: <users.id>'
```

SSE 연결이 끊기면 마지막으로 받은 이벤트 ID를 `Last-Event-ID` 헤더로 다시 보내
누락 이벤트를 이어받을 수 있다. 분석 완료 뒤에는 `completed` 이벤트를 전송하고
스트림을 닫으며, 결과 API에서도 동일한 결과를 재조회할 수 있다.

## Database migrations

TypeORM `synchronize`는 사용하지 않는다. 스키마 변경은 `src/database/migrations`에 migration을 추가하고 `npm run migration:run`으로 적용한다.

## 상권별 유동인구 가져오기

서울 열린데이터광장의 `VwsmTrdarFlpopQq` API를 분기와 1,000행 단위로 반복 조회해
`commercial_area_floating_population_statistic`에 upsert한다. `.env`에 발급받은
`SEOUL_OPEN_DATA_API_KEY`를 설정하고 migration 적용 후 실행한다.

```bash
npm run migration:run
npm run import:floating-population
```

기본 범위는 2025년 1분기부터 2026년 4분기까지다. 아직 공표되지 않아 API가
`INFO-200`을 반환한 분기는 건너뛴다. 범위 지정과 DB 적재 없는 검증도 가능하다.

```bash
npm run import:floating-population -- --from 20251 --to 20262
npm run import:floating-population -- --from 20251 --to 20264 --dry-run
```
