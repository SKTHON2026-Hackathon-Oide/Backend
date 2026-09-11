# 건물 위치 기반 AI 업종 추천 및 SSE 설계

## 1. 목표와 범위

입력은 서울시 내부 `buildingId` 하나로 제한한다. 층, 호실, 면적, 임대료,
건축물대장은 추천 필수 입력에서 제외한다.

최종 응답은 다음을 포함한다.

- 추천 업종 TOP 5
- 업종별 총점과 항목별 점수
- 업종별 추천 영업시간과 그 근거
- 전체 시간대별 유동인구 TOP 5
- 추천 근거, 위험 요인, 결측 데이터, 통계 기준 시점
- 사용한 모델, 프롬프트, 가중치 및 방법론 버전

추천은 성공이나 수익을 보장하는 판단이 아니라 상권 통계 기반 의사결정 보조
정보로 제공한다.

## 2. 전체 처리 구조

```text
Client
  ├─ POST /v1/buildings/{buildingId}/recommendation-requests
  └─ GET  /v1/recommendation-requests/{requestId}/events (SSE)
                        │
                        ▼
NestJS Recommendation Orchestrator
  ├─ 인증, 건물/서비스 지역 검증, 멱등성 처리
  ├─ 요청 상태·SSE 이벤트·최종 결과 저장
  ├─ OpenAI Responses API 실행
  └─ AI 출력 후보/수치/근거 검증
                        │
                        ▼
Recommendation MCP Server (read-only)
  ├─ 건물→상권 해석
  ├─ 주변 점포·업종 통계 집계
  ├─ 성별·연령·요일·시간대 유동인구 집계
  ├─ 업종별 보편적 profile 조회
  └─ 후보와 출처가 붙은 evidence packet 반환
                        │
                        ▼
PostgreSQL/PostGIS (MCP 전용 SELECT 계정)
```

API와 MCP는 같은 저장소에서 시작해도 실행 프로세스와 DB 계정은 분리한다. MCP에는
임의 SQL 도구를 노출하지 않는다.

## 3. HTTP API와 SSE 계약

### 3.1 분석 요청 생성

```http
POST /api/v1/buildings/{buildingId}/recommendation-requests
X-User-Id: 1
Idempotency-Key: <uuid>
Content-Type: application/json

{
  "userPreference": null
}
```

`buildingId` 이외의 입력은 선택 사항이다. 사용자 선호가 없으면 기본 가중치
프로파일을 사용한다. 같은 사용자·건물·멱등키 요청은 같은 `requestId`를 반환한다.

```http
202 Accepted
```

```json
{
  "requestId": "12345",
  "status": "QUEUED",
  "eventsUrl": "/api/v1/recommendation-requests/12345/events",
  "resultUrl": "/api/v1/recommendation-requests/12345"
}
```

### 3.2 SSE 구독

```http
GET /api/v1/recommendation-requests/{requestId}/events
X-User-Id: 1
Accept: text/event-stream
Last-Event-ID: 17
```

이벤트 종류:

| 이벤트           | 의미                | 핵심 데이터                       |
| ---------------- | ------------------- | --------------------------------- |
| `connected`      | 스트림 연결 완료    | `requestId`, 현재 상태            |
| `progress`       | 단계 변경           | `stage`, `progress`, 사용자 문구  |
| `tool_started`   | MCP 도구 호출 시작  | 안전한 도구명                     |
| `tool_completed` | MCP 도구 완료       | 소요시간, 근거 개수, 기준 시점    |
| `warning`        | 결측·대체 지표 발생 | 공개 가능한 코드와 문구           |
| `completed`      | 최종 결과 확정      | 완성된 결과 전체 또는 `resultUrl` |
| `failed`         | 분석 실패           | 오류 코드, 재시도 가능 여부       |
| `heartbeat`      | 연결 유지           | 서버 시각                         |

각 이벤트에는 증가하는 `id`를 부여한다. 15초마다 heartbeat를 보내며, 프록시 버퍼링을
비활성화하고 `Cache-Control: no-cache`, `X-Accel-Buffering: no`를 사용한다. 연결이
끊기면 클라이언트는 `Last-Event-ID`로 미수신 이벤트부터 재구독한다. SSE 연결 종료와
분석 작업 취소는 동일하게 취급하지 않는다.

### 3.3 결과 재조회

```http
GET /api/v1/recommendation-requests/{requestId}
```

SSE를 놓쳤거나 앱을 다시 연 경우 저장된 진행 상태 또는 최종 결과를 반환한다.

## 4. 요청 상태 머신

```text
QUEUED
  → RESOLVING_LOCATION
  → COLLECTING_EVIDENCE
  → SCORING_WITH_AI
  → VALIDATING_RESULT
  → COMPLETED

각 실행 단계 → FAILED
```

요청 상태와 별도로 `cancel_requested_at`을 두고, 향후 취소 API를 추가할 수 있게 한다.
서버 재시작 시 `QUEUED`는 재실행하고, 일정 시간 이상 진행 중인 요청은 lease 만료 후
재시도한다. 모델 호출은 최대 1회 자동 재시도하며 같은 MCP 근거 스냅샷을 재사용한다.

## 5. MCP 도구 설계

AI가 수십 번 작은 쿼리를 호출하지 않도록 네 개의 읽기 전용 도구로 제한한다.

### 5.1 `resolve_building_trade_area`

입력: `building_id`

출력:

- 건물 ID, 주소, 중심 좌표
- 연결 상권 ID·이름·유형·중첩률
- 직접 연결이 없을 때 공간 조인한 인접 상권
- 분석 반경과 데이터 기준 시점

### 5.2 `get_local_commerce_evidence`

입력: `building_id`, `commercial_area_ids`, `radius_meters=[100,300,500]`,
`candidate_limit=30`

출력:

- 반경별 전체 점포 수와 표준 업종 분포
- 업종별 점포 수, 점포 증감, 개·폐업률
- 추정 매출, 점포당 매출, 수요·경쟁 점수
- 동일 업종 경쟁 밀도와 공급 부족 지표
- 후보 업종 최대 30개와 후보 생성 사유

### 5.3 `get_population_evidence`

입력: `commercial_area_ids`, `as_of=null`

출력:

- 총 유동인구와 성별 비율
- 10·20·30·40·50·60대 이상 인구 및 비율
- 요일별 유동인구
- `00-06`, `06-11`, `11-14`, `14-17`, `17-21`, `21-24` 시간대 인구
- 최신 공통 분기와 전분기 대비 증감
- 상주·직장인구가 있으면 함께 반환

### 5.4 `get_business_profiles`

입력: `business_category_codes[]`, `profile_version`

출력:

- 업종별 목표 연령대, 피크 요일·시간대
- 유동·상주·직장인구 중요도
- 경쟁 허용도, 주말·야간 의존도, 배달 적합도
- profile 출처와 신뢰도
- 일반적인 운영시간 제약 및 근거 문구

모든 MCP 수치는 `evidenceId`, `value`, `unit`, `asOf`, `source`, `quality`를 가진다.
`quality`는 `MEASURED`, `DERIVED`, `PROXY` 중 하나다. 결측은 0으로 바꾸지 않고
`null`과 `missingReason`으로 반환한다.

## 6. AI 에이전트 실행 규칙

Responses API에는 MCP 서버와 최종 JSON Schema만 허용한다. 도구 호출 상한은 6회,
전체 분석 제한시간은 90초로 시작한다.

에이전트 순서:

1. 건물과 상권을 해석한다.
2. 주변 점포·업종 통계와 유동인구를 조회한다.
3. 후보 업종에 해당하는 profile을 조회한다.
4. 프롬프트의 버전 고정 가중치로 후보를 채점한다.
5. 후보 집합 안에서 TOP 5를 선정한다.
6. 업종별 추천 영업시간과 근거·위험을 작성한다.
7. 지정된 JSON Schema로만 최종 출력한다.

금지 규칙:

- MCP가 반환하지 않은 업종, 수치, 상권을 생성하지 않는다.
- 결측값을 0으로 간주하지 않는다.
- 낮은 경쟁을 무조건 좋은 신호로 해석하지 않는다.
- 층·면적·임대료·실제 공실 여부를 알고 있다고 주장하지 않는다.
- 통계 기준 시점이 다른 값을 같은 시점처럼 서술하지 않는다.
- 추천을 성공·허가·수익 보장으로 표현하지 않는다.

## 7. 점수 체계 v1

AI가 항목별 점수를 판단하지만 가중치와 합산식은 프롬프트에 고정한다.

| 항목          | 가중치 | 판단 근거                                |
| ------------- | -----: | ---------------------------------------- |
| 상권 수요     |     25 | 수요 점수, 매출, 점포당 매출, 유동인구   |
| 공급 기회     |     20 | 점포 수, 증감, 수요 대비 공급 부족       |
| 고객층 적합도 |     20 | profile과 성별·연령대 분포의 일치        |
| 시간대 적합도 |     15 | profile 피크와 시간대·요일 유동인구 일치 |
| 경쟁 건전성   |     10 | 경쟁도, 폐업률, 검증된 수요의 결합       |
| 데이터 신뢰도 |     10 | 최신성, 결측률, 실측/파생/대체 비중      |

각 항목은 0~100점이고 총점은 가중합이다. 서버는 가중치 합이 100인지, 총점이
항목 점수의 가중합과 허용 오차 0.1 이내인지 재계산한다. AI는 MCP 후보의 원시 값을
변경할 수 없다.

영업시간은 업종별 profile 피크 시간과 실제 시간대 유동인구를 각각 50% 반영한다.
영업 준비·마감 시간을 포함한 실제 운영 구간으로 확장하되, 원본 6개 통계 시간대와
연결되는 `evidenceIds`를 남긴다. 전역 `topOperatingTimeBands`는 유동인구 기준 상위
5개를 별도로 반환한다.

## 8. 최종 결과 계약

```json
{
  "requestId": "12345",
  "status": "COMPLETED",
  "building": {
    "id": "1146774",
    "address": "서울특별시 ..."
  },
  "summary": "...",
  "recommendations": [
    {
      "rank": 1,
      "businessCategoryCode": "CS100010",
      "businessCategoryName": "커피-음료",
      "totalScore": 82.4,
      "scoreBreakdown": {
        "demand": 86,
        "supplyOpportunity": 78,
        "customerFit": 88,
        "timeFit": 84,
        "competitionHealth": 70,
        "dataConfidence": 80
      },
      "recommendedOperatingHours": ["07:00-11:00", "11:00-17:00"],
      "reasons": ["...", "...", "..."],
      "risks": ["..."],
      "evidenceIds": ["ev_...", "ev_..."]
    }
  ],
  "topOperatingTimeBands": [
    { "rank": 1, "timeRange": "17:00-21:00", "population": 123456 }
  ],
  "dataAsOf": {
    "commerce": "2026Q1",
    "floatingPopulation": "2026Q2",
    "profile": "location-business-v1"
  },
  "missingData": [],
  "methodologyVersion": "location-business-score-v1",
  "promptVersion": "location-business-agent-v1",
  "disclaimer": "통계 기반 의사결정 보조 결과입니다."
}
```

## 9. 저장 구조

### `recommendation_request` 확장

- `building_id`
- `status`, `progress`, `current_stage`
- `idempotency_key`
- `prompt_version`, `methodology_version`, `model`
- `data_as_of jsonb`, `missing_data jsonb`
- `started_at`, `completed_at`, `failed_at`
- `failure_code`, `failure_message`
- `lease_owner`, `lease_expires_at`, `attempt_count`
- `UNIQUE(user_id, idempotency_key)`

### `space_business_recommendation_result`

- `request_id`, `business_category_code`, `rank`, `total_score`
- `score_breakdown jsonb`
- `recommended_operating_hours jsonb`
- `reasons jsonb`, `risks jsonb`, `evidence_ids jsonb`
- `UNIQUE(request_id, rank)`, `UNIQUE(request_id, business_category_code)`

### `recommendation_evidence_snapshot`

- `request_id`, `evidence_id`, `tool_name`
- `source_table`, `source_period`, `quality`
- `payload jsonb`, `payload_hash`, `duration_ms`

### `recommendation_event`

- `id bigserial`, `request_id`, `event_type`, `payload jsonb`, `created_at`
- SSE 재연결과 완료 이벤트 재전송을 위해 일정 기간 보관한다.

원본 개인정보나 API 키는 저장하지 않는다. MCP 원본 패킷은 크기 제한 후 저장하며
대용량 geometry와 전체 점포 행은 보관하지 않는다.

## 10. 오류와 복구 정책

| 오류 코드                   | 처리                                  |
| --------------------------- | ------------------------------------- |
| `BUILDING_NOT_FOUND`        | 404, 작업 생성 안 함                  |
| `OUT_OF_SERVICE_AREA`       | 422, 작업 생성 안 함                  |
| `COMMERCIAL_AREA_NOT_FOUND` | 실패 또는 반경 공간 조인 fallback     |
| `INSUFFICIENT_EVIDENCE`     | AI 호출 없이 결측 내용을 포함한 실패  |
| `MCP_TIMEOUT`               | 같은 요청에서 1회 재시도              |
| `MODEL_TIMEOUT`             | 동일 evidence snapshot으로 1회 재시도 |
| `INVALID_MODEL_OUTPUT`      | repair 1회 후 실패                    |
| `RESULT_VALIDATION_FAILED`  | 후보·점수·근거 위반 기록 후 실패      |

MCP 일부 지표가 없더라도 핵심 상권·점포·유동인구가 있으면 `warning` 이벤트를 보내고
분석을 계속한다. 유동인구와 상권 업종 통계가 모두 없으면 추천을 생성하지 않는다.

## 11. 관측성과 보안

- API→MCP는 회전 가능한 서비스 토큰으로 인증한다.
- MCP DB 계정은 필요한 view에만 `SELECT` 권한을 가진다.
- 요청별 correlation ID를 API, MCP, 모델 호출, SSE 이벤트에 전달한다.
- 모델 입력·출력 토큰, 도구별 지연, DB 지연, 총 분석시간, 재시도 횟수를 기록한다.
- 사용자에게는 안전한 오류 코드만 노출하고 SQL·모델 내부 오류는 로그에만 남긴다.
- 동시 실행 수, 사용자별 rate limit, 요청당 모델 비용 상한을 적용한다.

## 12. 테스트와 수용 기준

- 같은 DB 스냅샷·프롬프트·모델 설정에서 후보와 산술 점수가 재검증 가능하다.
- TOP 5 업종 코드는 MCP 후보에 반드시 존재한다.
- 모든 이유 문장은 하나 이상의 실제 `evidenceId`를 참조한다.
- 총점은 서버 재계산 결과와 0.1점 이내로 일치한다.
- 결측값이 0으로 변환되지 않는다.
- SSE 연결 해제 후 `Last-Event-ID`로 누락 없이 이어받는다.
- heartbeat, 완료, 실패 이벤트가 프록시 환경에서도 즉시 전달된다.
- 중복 멱등 요청이 모델 작업을 두 번 생성하지 않는다.
- MCP timeout, 모델 timeout, 비정상 JSON, 후보 밖 업종을 각각 테스트한다.
- 최소 30개 건물을 골든 케이스로 구성하고 상권 전문가 평가를 기록한다.
- MCP 조회 p95 2초, 전체 분석 p95 60초, 최대 90초를 초기 목표로 한다.

## 13. 구현 순서

1. 데이터 준비성 SQL: 최신 분기, 결측률, 건물-상권 연결률 확인
2. 점수 가중치 v1, MCP 입력·출력 Schema, 최종 결과 Schema 고정
3. 추천 요청·결과·근거·이벤트 migration과 repository 구현
4. 네 개 MCP 도구와 read-only DB view 구현
5. 버전 관리되는 developer prompt와 Responses API 오케스트레이터 구현
6. 후보·점수·evidence 검증기 구현
7. 비동기 worker, lease, 재시도, timeout 구현
8. POST 생성 API, GET 결과 API, GET SSE API 구현
9. 프론트 SSE 재연결 및 진행 단계 UI 연결
10. 골든 케이스·부하·장애 테스트 후 가중치 보정

현재의 동기식 `GET /v1/buildings/{buildingId}/location-recommendations`는 데이터 조회
프로토타입으로만 유지한다. 위 흐름이 완성되면 비동기 요청 API로 교체하거나 내부
MCP 집계 쿼리의 검증용 endpoint로 제한한다.
