# 건물 선택·건축물대장·MCP 상권 분석 구현 계획

## 0. 문서 목적과 현재 상태

이 문서는 다음 사용자 흐름을 SKTHON 백엔드와 프론트엔드에 구현하기 위한 실행
계획이다.

```text
주소 검색 및 지도 핀 지정
  → 좌표와 겹치는 내부 건물 후보 조회
  → 사용자가 건물 선택
  → 건축HUB 건축물대장 조회
  → 사용자가 층·호·전유면적 후보 선택 또는 직접 입력
  → 최종 분석 요청
  → AI가 MCP 근거를 사용해 적합 업종 TOP 5 분석
```

이 문서 작성 시점의 기준 커밋은 `2655740`이다. 현재 저장소에는 건물, 상권,
건물-상권 연결, 점포, 유동인구, 업종별 분석 프로파일과 추천 요청/결과의 초기
엔티티가 존재한다. 그러나 이 문서에 정의한 좌표 검색 API, 건축HUB 연동, 분석
컨텍스트, 공간→업종 MCP 도구와 AI 오케스트레이터는 아직 구현되지 않았다.

다른 작업자는 구현을 시작하기 전에 반드시 다음을 먼저 확인한다.

```bash
git status --short
git branch --show-current
git log -5 --oneline --decorate
```

- 사용자 또는 다른 작업자의 미커밋 변경을 덮어쓰지 않는다.
- 기존 migration 파일을 수정하지 않고 다음 미사용 migration 번호를 사용한다.
- TypeORM `synchronize`를 켜지 않는다.
- 이 문서보다 실제 최신 스키마가 앞서 있으면 파일 번호와 필드 충돌을 먼저
  조정하고 작업 기록에 남긴다.

관련 상위 설계는 [`mcp-recommendation-plan.md`](./mcp-recommendation-plan.md)를
참고한다. 두 문서가 충돌하면 이 문서의 공간→업종 사용자 흐름과 API 계약을
우선하고, 공통 MCP 보안·근거·결측 처리 원칙은 상위 문서를 따른다.

## 1. 확정된 제품 결정

1. 프론트엔드는 VWorld 등으로 주소를 검색하고 WGS84 경도·위도를 백엔드에
   전달한다.
2. 백엔드는 핀을 포함하는 내부 `building.geom` 후보들을 반환한다.
3. 사용자가 지도에서 분석할 건물 하나를 명시적으로 선택한다.
4. 건축HUB 호출은 브라우저나 AI가 아니라 백엔드가 담당한다.
5. 건축HUB는 필지 단위로 조회되므로 한 필지의 여러 대장 건물과 호실을 서버에서
   그룹화하고, 모호한 항목만 사용자에게 선택시킨다.
6. 건축물대장에 호실별 전유면적이 있으면 객관식 선택지를 제공한다.
7. 전유면적이 없으면 사용자가 층과 전용면적을 직접 입력할 수 있다.
8. `buildingId + floor + exclusiveAreaSqm`이 검증된 경우에만 `SPACE_DETAIL`,
   그 외에는 `LOCATION_ONLY` 분석으로 진행한다.
9. 분석 모드는 AI가 추측하지 않고 백엔드가 결정한다.
10. MCP는 읽기 전용 통계 조회와 결정론적 전처리·사전 후보 산출을 담당한다.
11. AI는 MCP가 반환한 후보와 근거 안에서 최종 TOP 5와 설명을 생성한다.
12. 건축물대장 정보는 현재 공실 여부나 실제 임대차 계약 조건으로 간주하지 않는다.

## 2. 시스템 경계와 책임

```text
Frontend
  ├─ 주소 검색·지도 핀
  ├─ 내부 건물 후보 선택
  ├─ 건축물대장 공간 옵션 선택 또는 수동 입력
  └─ 분석 상태·결과 표시

NestJS API
  ├─ 분석 컨텍스트와 상태 관리
  ├─ 좌표→건물 공간 조회
  ├─ PNU→건축HUB 요청 파라미터 변환
  ├─ 건축HUB 호출·매칭·캐시
  ├─ 사용자 선택 검증·분석 모드 결정
  ├─ AI Responses API 호출
  └─ 요청·도구 근거·결과 저장

Recommendation MCP
  ├─ buildingId와 검증된 공간 조건 입력 검증
  ├─ 상권·점포·유동인구·업종 프로파일 조회
  ├─ 결측·출처·기준 시점 정리
  └─ 상위 업종 후보와 근거 패킷 반환

PostgreSQL/PostGIS
  ├─ 내부 건물·상권·점포·통계
  ├─ 분석 컨텍스트
  ├─ 건축HUB 캐시
  └─ 분석 요청·결과·도구 추적
```

건축HUB 어댑터를 MCP에 넣지 않는다. 외부 API 키, 호출 제한, 캐시와 장애 처리는
NestJS API의 인프라 계층이 소유한다. MCP는 이미 검증된 `buildingId`와 공간 조건을
받아 내부 DB를 읽는다.

## 3. 사용자 흐름과 상태 전이

### 3.1 분석 컨텍스트 상태

```text
POINT_RESOLVED
  → BUILDING_SELECTED
  → REGISTRY_LOADING
  → DETAIL_SELECTION_REQUIRED
      ├─ SPACE_DETAIL_READY
      └─ LOCATION_ONLY_READY
  → ANALYZING
  → COMPLETED | FAILED | EXPIRED
```

- 좌표 검색 성공 시 `POINT_RESOLVED` 컨텍스트를 생성한다.
- 선택한 `buildingId`가 최초 후보 목록에 없으면 거부한다.
- 건축HUB 결과가 없거나 실패해도 `LOCATION_ONLY_READY`로 계속 진행할 수 있다.
- 컨텍스트는 사용자별로 소유하고 기본 24시간 후 만료한다.
- 이미 분석이 시작된 컨텍스트의 건물·공간 선택은 변경하지 않는다. 변경하려면 새
  컨텍스트를 생성한다.
- 동일 분석 시작 요청에는 idempotency key를 적용해 중복 모델 호출을 막는다.

### 3.2 좌표 오차 처리

1. 입력 좌표를 EPSG:4326으로 검증한다.
2. PostGIS에서 EPSG:5186으로 변환한다.
3. `ST_Covers(building.geom, point)`로 정확히 포함되는 건물을 찾는다.
4. 정확한 후보가 없을 때만 `ST_DWithin(..., 10)`으로 10m 이내 최근접 후보를 찾는다.
5. 최근접 결과는 `matchType=NEARBY`와 실제 거리를 함께 반환한다.
6. 10m 이내에도 없으면 자동으로 더 넓히지 않고 `NO_BUILDING_NEAR_POINT`를 반환한다.

핵심 공간 쿼리 형태:

```sql
WITH input AS (
  SELECT ST_Transform(
    ST_SetSRID(ST_Point(:longitude, :latitude), 4326),
    5186
  ) AS point
)
SELECT building.*
FROM building, input
WHERE ST_Covers(building.geom, input.point);
```

`building_geom_gix`가 사용되는지 `EXPLAIN (ANALYZE, BUFFERS)`로 확인한다. 응답용
geometry는 `ST_Transform(..., 4326)` 후 단순화한 GeoJSON으로 제한한다.

## 4. HTTP API 계약

모든 예시는 전역 prefix `/api`를 포함한다. 프로젝트의 공통 응답 인터셉터가
payload를 감싸므로 구현 시 실제 Swagger 예시는 현재 응답 규약과 맞춘다.

### 4.1 좌표로 분석 컨텍스트 생성

```http
POST /api/v1/space-analysis-contexts
Idempotency-Key: <optional-uuid>
```

```json
{
  "longitude": 127.0365,
  "latitude": 37.5442
}
```

검증:

- longitude: `-180..180`
- latitude: `-90..90`
- 서울 서비스 범위를 벗어나면 `OUT_OF_SERVICE_AREA`
- 후보는 정확 일치 우선, 최대 20개

응답:

```json
{
  "contextId": "uuid",
  "status": "POINT_RESOLVED",
  "point": { "longitude": 127.0365, "latitude": 37.5442 },
  "candidates": [
    {
      "buildingId": "12345",
      "matchType": "INTERSECTS",
      "distanceMeters": 0,
      "buildingName": "성수빌딩",
      "jibunAddress": "서울특별시 성동구 성수동1가 123-4",
      "mainUseName": "제2종근린생활시설",
      "buildingAreaSqm": 214.5,
      "totalFloorAreaSqm": 1050.3,
      "groundFloorCount": 5,
      "geometry": { "type": "MultiPolygon", "coordinates": [] }
    }
  ]
}
```

### 4.2 내부 건물 선택과 건축HUB 조회

```http
PUT /api/v1/space-analysis-contexts/{contextId}/building
```

```json
{ "buildingId": "12345" }
```

처리:

1. 사용자 소유권과 컨텍스트 상태 확인
2. `buildingId`가 최초 후보인지 확인
3. `building.pnu`, `legal_dong_code`, 지번주소 조회
4. 유효한 건축HUB 캐시 확인
5. 캐시가 없으면 기본개요→층별개요→전유공용면적 순서로 호출
6. 필지 내 대장 건물을 그룹화하고 내부 건물과 매칭
7. 객관식 공간 옵션 생성 후 캐시에 저장

응답 상태:

- `UNIT_OPTIONS_AVAILABLE`: 호실별 전유면적 존재
- `FLOOR_OPTIONS_ONLY`: 층별 전체 면적만 존재
- `BUILDING_ONLY`: 건물 기본 정보만 존재
- `REGISTRY_NOT_FOUND`: 건축물대장 조회 결과 없음
- `REGISTRY_BUILDING_SELECTION_REQUIRED`: 필지 내 대장 건물 매칭이 모호함
- `REGISTRY_UNAVAILABLE`: 외부 API 장애이며 사용할 캐시도 없음

대표 응답:

```json
{
  "contextId": "uuid",
  "status": "DETAIL_SELECTION_REQUIRED",
  "registryStatus": "UNIT_OPTIONS_AVAILABLE",
  "ledgerMatch": {
    "buildingName": "성수빌딩",
    "address": "서울특별시 성동구 성수동1가 123-4",
    "confidence": 0.94,
    "sourceAsOf": "20260911"
  },
  "spaceOptions": [
    {
      "optionId": "server-generated-opaque-id",
      "dongName": "주건축물",
      "floor": 1,
      "floorName": "지상 1층",
      "unitName": "101호",
      "exclusiveAreaSqm": 59.72,
      "commonAreaSqm": 13.41,
      "registeredUseCode": "...",
      "registeredUseName": "일반음식점",
      "areaSource": "BUILDING_HUB_EXCLUSIVE_AREA"
    }
  ],
  "manualInputAllowed": true
}
```

### 4.3 공간 세부정보 선택

건축HUB 옵션 선택:

```http
PUT /api/v1/space-analysis-contexts/{contextId}/space-detail
```

```json
{
  "source": "BUILDING_HUB",
  "optionId": "server-generated-opaque-id",
  "depositKrw": 30000000,
  "monthlyRentKrw": 2500000,
  "maintenanceFeeKrw": 300000,
  "parking": "UNAVAILABLE",
  "streetVisibility": "HIGH",
  "walkAccess": "GOOD"
}
```

수동 입력:

```json
{
  "source": "USER_INPUT",
  "floor": 1,
  "exclusiveAreaSqm": 59.72,
  "depositKrw": 30000000,
  "monthlyRentKrw": 2500000,
  "parking": "UNKNOWN"
}
```

규칙:

- 외부 옵션의 면적·층·호실 값은 `optionId`로 서버 캐시에서 다시 읽는다.
- 클라이언트가 외부 원본 값을 다시 보내도록 하지 않는다.
- `getBrFlrOulnInfo.area`는 층별 면적이므로 전유면적으로 변환하지 않는다.
- 수동 값과 대장 값이 다르면 사용자 선택을 우선하되 출처를 `USER_INPUT`으로 남긴다.
- 금액과 주차·노출·도보 접근성은 건축HUB 값으로 추정하지 않는다.
- `floor + exclusiveAreaSqm`이 모두 유효하면 `SPACE_DETAIL`, 아니면
  `LOCATION_ONLY`로 확정한다.

### 4.4 위치 기반 분석만 선택

```http
PUT /api/v1/space-analysis-contexts/{contextId}/space-detail/skip
```

건축HUB 결과가 없거나 사용자가 세부 선택을 원하지 않을 때 사용한다. 건물의
주용도, 전체 층수와 연면적은 보조 근거로 남지만 호실 적합도를 평가하지 않는다.

### 4.5 분석 시작과 결과 조회

```http
POST /api/v1/space-analysis-contexts/{contextId}/recommendations
Idempotency-Key: <required-uuid>
```

```json
{
  "naturalLanguageQuery": "이 공간에 잘 맞는 업종을 추천해줘"
}
```

성공 시 모델 호출을 비동기로 시작하고 `202 Accepted`를 반환한다.

```json
{
  "requestId": "98765",
  "status": "ANALYZING",
  "analysisMode": "SPACE_DETAIL"
}
```

```http
GET /api/v1/recommendations/{requestId}
```

프론트는 MVP에서 폴링하고 이후 SSE로 교체할 수 있다.

## 5. 건축HUB 연동 설계

### 5.1 환경 변수

`.env.example`에 실제 키 없이 다음 설정을 추가한다.

```text
BUILDING_HUB_SERVICE_KEY=
BUILDING_HUB_BASE_URL=https://apis.data.go.kr/1613000/BldRgstHubService
BUILDING_HUB_TIMEOUT_MS=5000
BUILDING_HUB_CACHE_TTL_DAYS=30
```

키는 서버 환경에서만 읽고 로그, Swagger 예제, MCP 인자, 프론트 응답에 포함하지
않는다.

### 5.2 PNU 변환기

`PnuBuildingHubQueryFactory`를 만들고 다음 값을 생성한다.

```text
sigunguCd
bjdongCd
platGbCd
bun
ji
```

PNU 길이, 숫자 여부와 대지/산 구분을 엄격히 검증한다. 문자열 위치를 여러
use case에 중복 구현하지 않는다. 정상 대지, 산, 부번 0, 부번 존재, 잘못된 길이,
PNU 없음 테스트를 작성한다.

### 5.3 호출 엔드포인트

```text
GET /getBrBasisOulnInfo
GET /getBrFlrOulnInfo
GET /getBrExposPubuseAreaInfo
```

공통 파라미터:

```text
serviceKey, sigunguCd, bjdongCd, platGbCd, bun, ji,
_type=json, numOfRows, pageNo
```

- `totalCount`를 기준으로 모든 페이지를 가져온다.
- 전국 또는 법정동 전체를 수집하지 않고 선택한 필지 결과만 페이지 처리한다.
- 기본 timeout 5초, 네트워크/5xx만 최대 2회 지수 백오프로 재시도한다.
- 인증 오류, 잘못된 파라미터, 일일 한도 초과는 재시도하지 않는다.
- 정상 캐시는 30일, `NOT_FOUND`는 1일 유지한다.
- 만료 캐시가 있고 외부 API가 실패하면 `isStale=true`로 반환할 수 있다.

### 5.4 내부 건물과 대장 건물 매칭

필지 결과를 `mgmBldrgstPk` 기준으로 그룹화하고 다음 신호를 점수화한다.

| 신호 | 초기 가중치 |
|---|---:|
| 정규화 지번주소 일치 | 40 |
| 정규화 건물명/동명칭 일치 | 25 |
| 주용도 일치 또는 호환 | 15 |
| 지상·지하층수 유사 | 10 |
| 연면적 유사 | 10 |

- 단일 후보면 자동 선택할 수 있지만 매칭 근거는 저장한다.
- 최고 점수가 기준 미만이거나 1·2위 차이가 작으면 사용자 선택을 요구한다.
- 매칭이 모호한 상태에서 임의의 첫 행을 선택하지 않는다.
- `source_building_id`가 건축HUB `bldgId`와 동일하다고 가정하지 않는다.

### 5.5 공간 옵션 생성

- 전유공용면적 행을 동·층·호 단위로 그룹화한다.
- `전유` 합계를 `exclusiveAreaSqm`, `공용` 합계를 `commonAreaSqm`으로 분리한다.
- 용도, 구조, 층명칭과 생성일자를 함께 보존한다.
- 중복 행은 안정적인 fingerprint로 제거한다.
- `optionId`는 캐시 ID와 option fingerprint를 가리키는 불투명 ID로 생성한다.
- 층별개요만 있을 때는 `floorAreaSqm`으로 반환하고 `exclusiveAreaSqm` 필드는
  만들지 않는다.

## 6. MCP와 AI 분석 설계

### 6.1 MCP 도구

공간→업종 분석에는 다음 읽기 전용 도구 하나를 우선 구현한다.

```text
get_space_business_evidence
```

입력:

```json
{
  "buildingId": "12345",
  "analysisMode": "SPACE_DETAIL",
  "spaceDetail": {
    "floor": 1,
    "exclusiveAreaSqm": 59.72,
    "depositKrw": 30000000,
    "monthlyRentKrw": 2500000,
    "parking": "UNAVAILABLE"
  },
  "radiusMeters": [100, 300, 500],
  "candidateLimit": 20,
  "asOf": null
}
```

MCP가 조회·산출할 근거:

1. `commercial_area_building`으로 연결된 상권과 중첩률
2. 공간 조인 fallback으로 확인한 상권
3. 반경 100m·300m·500m 점포 수와 업종 분포
4. 동일 업종 경쟁 점포와 보완 업종 분포
5. 유동인구 총량, 성별, 연령, 시간대, 요일
6. 상주인구·직장인구가 있으면 해당 값
7. 업종별 점포·매출·폐업·수요·경쟁 지표
8. 임대료가 있으면 입력 임대료와 상권 단위 비교
9. 건물 주용도·층·면적과 업종 공간 프로파일 적합도
10. 모든 지표의 기준 시점, 산출 방식과 결측 사유

근거 값에는 다음 타입을 붙인다.

```text
MEASURED: 원천 또는 집계 통계
DERIVED: 서버가 계산한 값
PROXY: 직접 지표가 없어 사용한 대체값
USER_PROVIDED: 사용자 입력
REGISTRY: 건축물대장 값
```

### 6.2 후보와 AI의 경계

1. MCP는 하드 조건 위반 후보를 제거한다.
2. 버전이 있는 고정 산식으로 표준 업종 약 100개를 사전 채점한다.
3. 상위 15~20개와 점수 구성·근거·위험·결측을 반환한다.
4. AI는 반환 후보 안에서만 최종 TOP 5를 선택한다.
5. AI는 원시 수치와 MCP 점수를 변경하지 않는다.
6. 후보 밖 업종 코드를 생성하면 결과 검증에서 실패 처리한다.

법적 영업 가능 여부가 확실한 데이터가 없는 경우 하드 필터로 단정하지 않고
`LEGAL_USE_CONFIRMATION_REQUIRED` 위험으로 남긴다. `AI_HEURISTIC/LOW` 업종
프로파일은 제한된 보조 점수로 사용하고 실측 통계보다 우선하지 않는다.

### 6.3 AI developer prompt 규칙

- MCP 응답에 없는 수치나 사실을 생성하지 않는다.
- 건축물대장 값과 사용자 입력을 명확히 구분한다.
- 건축물대장으로 현재 공실이나 임대 가능 여부를 단정하지 않는다.
- 결측값을 0으로 해석하지 않는다.
- `LOCATION_ONLY`에서는 층·전용면적 기반 적합성을 주장하지 않는다.
- 각 추천에 근거 2개 이상과 위험 요인 1개 이상을 포함한다.
- 통계 기준 시점과 사용한 대체 지표를 표시한다.
- 지정된 JSON Schema로만 응답한다.

최종 응답의 핵심 필드:

```json
{
  "requestId": "98765",
  "analysisMode": "SPACE_DETAIL",
  "summary": "...",
  "recommendations": [
    {
      "rank": 1,
      "businessCategoryCode": "CS100010",
      "businessCategoryName": "커피-음료",
      "score": 84.2,
      "reasons": [],
      "risks": [],
      "evidenceIds": []
    }
  ],
  "dataAsOf": {},
  "missingData": [],
  "disclaimer": "통계 기반 의사결정 보조 결과입니다."
}
```

## 7. 데이터베이스 변경 계획

### 7.1 신규 `space_analysis_context`

```text
id UUID PRIMARY KEY
user_id BIGINT REFERENCES users(id)
longitude NUMERIC(10,7)
latitude NUMERIC(10,7)
candidate_building_ids JSONB
selected_building_id BIGINT NULL REFERENCES building(id)
selected_registry_cache_id BIGINT NULL
selected_space_detail JSONB NULL
analysis_mode VARCHAR(30) NULL
status VARCHAR(40)
expires_at TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

제약과 인덱스:

- longitude/latitude 범위 CHECK
- analysis mode: `LOCATION_ONLY | SPACE_DETAIL`
- 상태 enum CHECK 또는 TypeScript/PostgreSQL enum 중 프로젝트 규칙에 맞춰 하나 선택
- `(user_id, created_at DESC)` 인덱스
- `expires_at` 인덱스
- `selected_building_id` 인덱스

`candidate_building_ids`는 최초 응답 후보를 재검증하기 위한 작은 배열만 저장한다.
원본 geometry는 저장하지 않는다.

### 7.2 신규 `building_registry_cache`

```text
id BIGINT IDENTITY PRIMARY KEY
building_id BIGINT NOT NULL REFERENCES building(id)
pnu VARCHAR(30)
request_fingerprint VARCHAR(128)
status VARCHAR(40)
matched_mgm_bldrgst_pk VARCHAR(100)
match_confidence NUMERIC(5,4)
normalized_options JSONB
raw_response JSONB
source_created_at DATE NULL
fetched_at TIMESTAMP
expires_at TIMESTAMP
last_error_code VARCHAR(100) NULL
created_at TIMESTAMP
updated_at TIMESTAMP
```

제약과 인덱스:

- `UNIQUE(building_id, request_fingerprint)`
- `(building_id, expires_at DESC)` 인덱스
- status CHECK
- confidence 범위 CHECK `0..1`

서비스 키와 실제 요청 URL의 인증값은 저장하지 않는다. `raw_response`가 지나치게
커지면 응답 종류별 payload를 압축하거나 원본 저장을 생략하고 정규화 결과만 남긴다.

### 7.3 `recommendation_request` 확장

현재 엔티티에는 자연어, 파싱 조건과 가중치만 있다. 다음 필드를 migration으로
추가한다.

```text
subject_building_id BIGINT NULL REFERENCES building(id)
space_analysis_context_id UUID NULL REFERENCES space_analysis_context(id)
analysis_mode VARCHAR(30)
status VARCHAR(30)
prompt_version VARCHAR(50)
methodology_version VARCHAR(50)
selected_space_detail JSONB NULL
data_as_of JSONB NULL
model_name VARCHAR(100) NULL
failure_code VARCHAR(100) NULL
started_at TIMESTAMP NULL
completed_at TIMESTAMP NULL
updated_at TIMESTAMP
```

기존 행이 존재할 수 있으므로 nullable 추가→기존 행 backfill→제약 강화 순서로
migration을 작성한다. `natural_language_query`가 비어도 UI 구조 입력으로 분석할 수
있어야 한다면 별도 migration에서 nullable 여부를 명시적으로 결정한다.

### 7.4 신규 `space_business_recommendation_result`

기존 `recommendation_result`는 `building_id` 후보를 저장하는 업종→건물 구조다.
공간→업종 결과를 억지로 저장하지 않고 별도 테이블을 둔다.

```text
id BIGINT IDENTITY PRIMARY KEY
request_id BIGINT NOT NULL REFERENCES recommendation_request(id)
business_category_code VARCHAR(30) NOT NULL REFERENCES business_category(code)
rank INTEGER
total_score NUMERIC(10,4)
score_breakdown JSONB
evidence JSONB
explanation TEXT
risks JSONB
created_at TIMESTAMP
UNIQUE(request_id, rank)
UNIQUE(request_id, business_category_code)
```

### 7.5 신규 `recommendation_tool_trace`

```text
id BIGINT IDENTITY PRIMARY KEY
request_id BIGINT NOT NULL REFERENCES recommendation_request(id)
tool_name VARCHAR(100)
tool_input_hash VARCHAR(128)
tool_input JSONB
tool_output_hash VARCHAR(128)
tool_output JSONB
duration_ms INTEGER
status VARCHAR(30)
error_code VARCHAR(100) NULL
created_at TIMESTAMP
```

사용자 주소·임대료를 로그 정책에 맞게 마스킹한다. MCP의 대형 geometry나 불필요한
원천 행은 trace에 저장하지 않는다.

### 7.6 migration과 entity 예상 파일

구현 시 다음 미사용 migration 번호를 확인한다. 기준 커밋에서는 다음 번호가
`0000000000011`이지만 다른 작업이 먼저 추가됐으면 번호를 올린다.

```text
src/database/migrations/0000000000011-create-space-analysis-flow.ts
src/modules/buildings/infrastructure/persistence/typeorm/entities/
  building-registry-cache.entity.ts
  space-analysis-context.entity.ts
src/modules/recommendations/infrastructure/persistence/typeorm/entities/
  space-business-recommendation-result.entity.ts
  recommendation-tool-trace.entity.ts
```

필요하면 테이블 생성과 기존 추천 테이블 확장을 두 migration으로 나눈다. 모든
`down()`은 새 테이블·인덱스·컬럼을 역순으로 복구할 수 있어야 한다.

## 8. 예상 코드 구조

기존 모듈 폴더 규칙인 `applications`, `domain`, `interfaces`를 유지한다.

```text
src/modules/buildings/
  applications/usecases/
    create-space-analysis-context.usecase.ts
    select-analysis-building.usecase.ts
    select-space-detail.usecase.ts
  domain/ports/
    building-hub-gateway.port.ts
    building-registry-cache.port.ts
  domain/services/
    pnu-building-hub-query.factory.ts
    building-ledger-match.service.ts
    registry-space-option.service.ts
  infrastructure/external/building-hub/
    building-hub.client.ts
    building-hub.mapper.ts
    building-hub.types.ts
  infrastructure/persistence/typeorm/entities/
    space-analysis-context.entity.ts
    building-registry-cache.entity.ts
  interfaces/http/
    space-analysis-context.controller.ts
    dto/

src/modules/recommendations/
  applications/usecases/
    start-space-business-recommendation.usecase.ts
    get-recommendation.usecase.ts
  domain/ports/
    ai-recommendation.port.ts
  infrastructure/openai/
    openai-recommendation.client.ts
    space-business-developer-prompt.ts
    space-business-output.schema.ts
  infrastructure/persistence/typeorm/entities/
    space-business-recommendation-result.entity.ts
    recommendation-tool-trace.entity.ts
  interfaces/http/
    recommendation.controller.ts
    dto/

src/mcp/
  main.ts
  recommendation-mcp.module.ts
  tools/
    get-space-business-evidence.tool.ts
  services/
    space-business-evidence.service.ts
```

HTTP DTO, 외부 API DTO, MCP 입력 스키마와 AI 출력 스키마를 하나의 타입으로
재사용하지 않는다. 경계별 mapper를 둬 외부 변경이 도메인에 직접 전파되지 않게 한다.

## 9. 오류 코드

| 코드 | 의미 | 사용자 흐름 |
|---|---|---|
| `INVALID_COORDINATE` | 좌표 형식/범위 오류 | 핀 재선택 |
| `OUT_OF_SERVICE_AREA` | 서울 서비스 범위 밖 | 안내 후 중단 |
| `NO_BUILDING_NEAR_POINT` | 10m 이내 건물 없음 | 핀 재선택 |
| `BUILDING_NOT_IN_CONTEXT` | 최초 후보가 아닌 건물 선택 | 후보 다시 조회 |
| `PNU_UNAVAILABLE` | 외부 조회 키 부족 | 수동 정보 또는 위치 분석 |
| `REGISTRY_NOT_FOUND` | 대장 결과 없음 | 수동 정보 또는 위치 분석 |
| `REGISTRY_MATCH_AMBIGUOUS` | 필지 내 대장 건물 모호 | 대장 건물 선택 |
| `REGISTRY_TIMEOUT` | 건축HUB timeout | 캐시 또는 수동 입력 |
| `REGISTRY_RATE_LIMITED` | 호출량 초과 | 캐시 또는 위치 분석 |
| `SPACE_OPTION_EXPIRED` | 선택 옵션 캐시 만료 | 옵션 재조회 |
| `INVALID_SPACE_DETAIL` | 층/면적/금액 검증 실패 | 입력 수정 |
| `MCP_EVIDENCE_UNAVAILABLE` | 근거 조회 실패 | 재시도 가능 실패 |
| `AI_OUTPUT_INVALID` | AI JSON/후보 검증 실패 | 1회 재생성 후 실패 |

외부 API 결과 없음은 전체 기능 실패가 아니다. 사용자가 `LOCATION_ONLY`로 분석을
계속할 수 있도록 응답한다.

## 10. 테스트 계획

### 10.1 단위 테스트

- PNU→건축HUB 파라미터 변환
- 정상 대지/산/부번/잘못된 PNU
- 대장 행 grouping과 전유·공용 면적 합산
- 여러 건축물대장 후보의 매칭 점수
- 모호한 후보 자동 선택 방지
- option fingerprint 안정성
- 분석 모드 결정
- AI 최종 후보가 MCP 후보 안에 있는지 검증

### 10.2 DB·공간 통합 테스트

- 폴리곤 내부 포인트
- 폴리곤 경계 포인트
- 겹치는 복수 폴리곤
- 정확 후보 없음 + 10m 최근접
- 10m 밖 후보 제외
- EPSG:4326→5186 축 순서 검증
- `building_geom_gix` 사용 확인
- context 사용자 소유권과 상태 전이

### 10.3 건축HUB fixture 테스트

- 일반건축물 하나
- 한 필지의 여러 동
- 집합건축물의 여러 호실
- 전유/공용 행 중복과 합산
- 층별개요만 존재
- 빈 items와 `totalCount=0`
- 페이지 2개 이상
- XML/비정상 JSON 응답
- timeout, 5xx, 인증 오류, 호출량 초과
- 만료 캐시 fallback

실제 서비스 키가 필요한 테스트는 기본 CI에서 제외하고 별도 smoke test로 둔다.
CI 단위·통합 테스트는 fixture/mock 서버로 재현 가능해야 한다.

### 10.4 MCP·AI 계약 테스트

- MCP는 존재하지 않는 buildingId를 거부한다.
- MCP DB 계정으로 INSERT/UPDATE/DELETE가 불가능하다.
- 모든 evidence에 ID·출처·기준 시점이 있다.
- 결측값이 0으로 바뀌지 않는다.
- 후보는 설정 limit를 초과하지 않는다.
- AI TOP 5 코드가 MCP 후보에 모두 존재한다.
- `LOCATION_ONLY` 결과에 전용면적 기반 주장이 없다.
- Structured Output 실패 시 재시도는 최대 1회다.

### 10.5 E2E 수용 시나리오

1. 주소 검색→정확 건물 하나→대장 호실 선택→상세 분석 성공
2. 주소 검색→건물 여러 개→사용자 건물 선택→상세 분석 성공
3. 건물 선택→건축HUB 결과 없음→수동 입력→상세 분석 성공
4. 건물 선택→건축HUB 장애→위치 기반 분석 성공
5. 위치 분석→근거가 연결된 업종 TOP 5 반환
6. 동일 idempotency key 재호출→모델 중복 호출 없음

## 11. 구현 단계와 완료 조건

### 단계 1 — 계약과 공간 검색

- 분석 컨텍스트 API DTO와 OpenAPI 문서
- 좌표→건물 후보 PostGIS 쿼리
- 정확/최근접 후보 분류
- 컨텍스트 저장과 사용자 소유권

완료 조건: 좌표 fixture로 정확 후보, 복수 후보, 최근접 후보, 없음이 모두 테스트된다.

### 단계 2 — 건축HUB 어댑터

- PNU 파서
- HTTP client와 응답 mapper
- 세 endpoint pagination
- retry/timeout/error mapping
- 대장 건물 매칭과 공간 옵션 생성
- 캐시와 stale fallback

완료 조건: 실제 키 없이 fixture 테스트가 통과하고, 별도 smoke test로 한 필지 조회가
성공한다.

### 단계 3 — 프론트 선택 흐름

- 지도 건물 폴리곤 강조
- 내부 건물 선택
- 대장 건물 모호성 선택
- 층/호/전유면적 객관식 선택
- 수동 입력과 위치 분석 건너뛰기

완료 조건: 건축HUB 데이터 유무와 상관없이 분석 준비 상태까지 도달한다.

### 단계 4 — MCP 근거 도구

- read-only MCP DB 연결
- 상권·반경 점포·유동인구·업종 프로파일 조회
- 기준 분기 선택과 결측 처리
- 후보 사전 점수 v1과 evidence packet
- 도구 입력/출력 JSON Schema

완료 조건: 동일 DB와 입력에서 후보 순서·점수가 동일하고 모든 수치가 근거로
추적된다.

### 단계 5 — AI 오케스트레이터

- 버전 있는 developer prompt
- 허용 MCP 도구 제한
- Structured Output
- 후보 외 추천 방지 검증
- 요청 상태, trace, 결과 저장

완료 조건: 최종 TOP 5의 모든 업종 코드와 evidence ID가 실제 MCP 출력에 존재한다.

### 단계 6 — 통합 안정화

- E2E 6개 시나리오
- 건축HUB/MCP/AI 장애 fallback
- API/MCP timeout과 응답 크기 제한
- 최소 10개 골든 케이스 회귀 테스트

완료 조건: 주소 검색부터 TOP 5 결과까지 사용자 흐름이 끊기지 않고, 결측과 대체
지표가 사용자에게 표시된다.

## 12. DB 변경 시 덤프·커밋·푸시 필수 절차

이 절차는 선택 사항이 아니다. 테이블, 컬럼, 인덱스, FK, CHECK, enum, migration,
seed 또는 전처리 결과 중 하나라도 변경되면 **코드 완료만으로 작업을 완료 처리하지
않는다**. 최신 전체 DB dump와 checksum, 복원 검증, 커밋과 원격 push까지 같은
작업 범위에 포함한다.

### 12.1 변경 전

```bash
git status --short
npm run migration:show
```

- 기존 dump와 checksum 경로를 확인한다.
- 사용자의 미커밋 DB 파일을 덮어쓰지 않는다.
- 기존 migration은 수정하지 않고 새 migration을 추가한다.

### 12.2 migration과 seed 적용

```bash
npm run migration:run
./infra/databases/bootstrap/bootstrap-preprocessed.sh
```

- runtime 캐시 테이블처럼 seed 행이 없어도 migration으로 스키마를 생성한다.
- 기준 데이터가 필요하면 idempotent seed SQL을 추가하고
  `infra/databases/bootstrap/preprocess-seed.sql`에 연결한다.
- seed는 두 번 실행해도 중복이나 값 변형이 없어야 한다.
- migration 목록과 핵심 행 수·FK orphan·중복·CHECK를 SQL로 검증한다.

### 12.3 전체 custom-format dump 생성

최신 로컬 `skthon` DB의 스키마와 데이터를 모두 포함해 새 dump를 생성한다. 날짜가
달라졌으면 파일명, README와 checksum 파일명을 함께 갱신한다.

```bash
docker exec skthon-postgis sh -lc 'pg_dump \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges' \
  > infra/databases/seeds/dumps/skthon-preprocessed-YYYYMMDD.dump

cd infra/databases/seeds/dumps
shasum -a 256 skthon-preprocessed-YYYYMMDD.dump \
  > skthon-preprocessed-YYYYMMDD.dump.sha256
```

다음 파일을 반드시 함께 갱신한다.

```text
infra/databases/seeds/dumps/skthon-preprocessed-YYYYMMDD.dump
infra/databases/seeds/dumps/skthon-preprocessed-YYYYMMDD.dump.sha256
infra/databases/seeds/dumps/README.md
docs/preprocessing-worklog.md
```

덤프 파일은 전체 dump여야 한다. 변경된 테이블만 별도 덤프한 파일로 기존 전체
dump를 대체하지 않는다.

### 12.4 dump 복원 검증

운영 중인 개발 DB 위에 복원하지 않는다. 별도의 임시 검증 DB를 생성하고 dump를
복원한다.

검증 항목:

- `shasum -a 256 -c` 성공
- `pg_restore --list` 성공
- 빈 임시 DB에 `pg_restore --no-owner --no-privileges` 성공
- `typeorm_migrations`에 신규 migration 존재
- 신규 테이블·컬럼·인덱스·FK 존재
- 기준 seed 행 수 일치
- 핵심 기존 행 수가 원본 DB와 일치
- 전체 검증 SQL 통과

검증 DB 삭제는 정확한 임시 DB 이름을 확인한 뒤 수행한다. 개발/운영 DB를 대상으로
`DROP DATABASE`나 broad destructive command를 실행하지 않는다.

### 12.5 코드 검증

```bash
npm run build
npm test -- --runInBand
npm run lint
```

전체 lint에 기존 오류가 있으면 변경 파일 대상 lint는 반드시 통과시키고, 기존 오류와
이번 변경 오류를 구분해 작업 결과에 기록한다. 외부 건축HUB smoke test는 서비스 키가
있을 때만 실행하며 키를 출력하지 않는다.

### 12.6 커밋과 push

DB 변경과 이를 반영한 dump/checksum은 분리된 미완성 상태로 남기지 않는다. 최소한
최종 커밋에는 migration, entity, seed/bootstrap, validation, dump, checksum과 문서가
모두 포함되어야 한다.

```bash
git status --short
git diff --check
git diff --stat
git add <이번 작업의 명시적 파일들>
git commit -m "feat: add building registry analysis flow"
git push origin "$(git branch --show-current)"
git status --short
```

- `git add .` 대신 이번 작업 파일을 명시적으로 stage한다.
- unrelated 사용자 변경은 커밋하지 않는다.
- force push하지 않는다.
- push 후 `HEAD`와 원격 tracking branch가 같은지 확인한다.
- dump 생성·복원 검증이 실패한 상태에서는 커밋/푸시 완료를 보고하지 않는다.
- DB 변경이 전혀 없는 문서/애플리케이션 코드 변경이라면 dump를 불필요하게 다시
  생성하지 않는다.

## 13. 작업자가 최종 보고할 내용

다른 작업자는 완료 보고에 최소한 다음을 포함한다.

```text
구현한 사용자 흐름과 API
추가·수정한 migration 및 테이블
건축HUB 실제/fixture 검증 결과
MCP·AI 계약 테스트 결과
build/test/lint 결과
새 dump 파일명과 SHA-256
임시 DB 복원 검증 결과
커밋 해시
push한 remote/branch
남은 제약 또는 결측 데이터
```

“건축물대장 결과가 없음”, “전유면적이 없음”, “외부 API 장애”는 알려진 정상 분기다.
이 경우에도 위치 기반 분석이 성공하면 기능은 정상 동작한 것으로 본다.

## 14. MVP 완료 체크리스트

- [ ] 프론트가 주소 검색 결과 좌표를 백엔드에 보낸다.
- [ ] 백엔드가 정확/최근접 건물 후보와 지도 geometry를 반환한다.
- [ ] 사용자가 후보 건물을 선택한다.
- [ ] 서버가 PNU로 선택 필지의 건축HUB만 조회한다.
- [ ] 필지 내 여러 대장 건물을 안전하게 매칭한다.
- [ ] 전유면적이 있으면 층·호·면적 객관식 옵션을 제공한다.
- [ ] 옵션이 없으면 수동 입력 또는 위치 분석이 가능하다.
- [ ] 백엔드가 `LOCATION_ONLY | SPACE_DETAIL`을 결정한다.
- [ ] MCP가 상권·점포·유동인구·업종 프로파일 근거를 반환한다.
- [ ] AI가 MCP 후보 안에서 근거가 연결된 TOP 5를 반환한다.
- [ ] 결과에 기준 시점·결측·위험과 면책 문구가 있다.
- [ ] 모든 DB 변경은 migration과 entity에 반영됐다.
- [ ] DB 변경이 있으면 전체 dump/checksum을 새로 생성했다.
- [ ] 새 dump를 빈 임시 DB에 복원해 검증했다.
- [ ] build/test/변경 파일 lint가 통과했다.
- [ ] 변경 파일만 커밋했고 원격 branch에 push했다.
- [ ] 최종 worktree가 의도한 상태이며 unrelated 변경이 없다.
