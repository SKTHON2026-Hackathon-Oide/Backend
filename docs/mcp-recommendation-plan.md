# 상권 추천 MCP 개발 계획 초안

> 공간→업종 기능의 확정된 주소 검색, 건물 선택, 건축HUB 세부정보 선택, MCP·AI
> 구현 순서와 DB dump/commit/push 완료 규칙은
> [`space-analysis-building-registry-implementation-plan.md`](./space-analysis-building-registry-implementation-plan.md)를
> 우선 참고한다.

## 1. 목표

하나의 원격 MCP 서버가 상권·건물·업종 통계 데이터를 읽기 전용으로 조회하고,
AI가 그 근거 데이터만 사용해 다음 두 기능의 추천 결과를 생성하도록 한다.

1. **공간 → 업종 추천**
   - 입력: 공실 주소, 면적, 층, 임대 조건, 주차 여부
   - 출력: 입점 적합 업종 TOP 5와 근거·위험 요인
2. **업종 → 지역/건물 추천**
   - 입력: 희망 업종, 예산, 필요 면적, 선호 지역
   - 출력: 적합 상권과 건물 후보 TOP 5, 근거·위험 요인

MCP는 통계 조회와 후보 산출을 담당한다. 최종 문장 구성과 비교 평가는 AI가
사전 프롬프트에 따라 수행한다. 통계값 계산까지 AI에 맡기지 않아 같은 입력에
대한 재현성과 결과 추적성을 확보한다.

## 2. 설계 원칙

- MCP는 읽기 전용이다. 임의 SQL 실행이나 데이터 변경 도구를 제공하지 않는다.
- AI에 전체 원천 데이터를 보내지 않는다. SQL에서 후보를 20~50개로 줄이고
  정규화 점수와 근거를 함께 반환한다.
- 모든 숫자에는 기준 분기, 출처 테이블, 산출 방식(`MEASURED`, `DERIVED`,
  `PROXY`)을 붙인다.
- 서로 기준 분기가 다른 지표를 조용히 합치지 않는다. 최신 공통 분기를 우선하고,
  불가피한 경우 응답에 지표별 기준 시점을 명시한다.
- 결측값을 0으로 간주하지 않는다. `null`과 `missing_reasons`로 반환한다.
- 프롬프트 버전과 점수 산식 버전을 저장해 결과를 재현할 수 있게 한다.
- AI의 최종 TOP 5는 MCP가 반환한 후보 집합 안에서만 선택할 수 있다.

## 3. 권장 구성

```text
웹/앱 UI
   │
   ▼
NestJS Recommendation Orchestrator
   ├─ 요청 검증·사용자 권한 확인
   ├─ OpenAI Responses API 호출
   └─ 요청/결과/근거/버전 저장
                  │
                  │ Remote MCP tool call
                  ▼
Recommendation MCP Server (Streamable HTTP)
   ├─ 입력 스키마 검증
   ├─ 후보 검색·통계 집계·결정론적 점수 계산
   └─ 근거 패킷 반환
                  │
                  ▼
PostgreSQL/PostGIS (MCP 전용 read-only 계정)
```

현재 저장소에서는 별도 패키지를 새로 나누기보다 우선 아래처럼 동일 NestJS
코드베이스 안에 MCP 전용 진입점을 두는 안을 권장한다. 운영 배포 시에는 API와
MCP를 별도 프로세스/컨테이너로 실행한다.

```text
src/
  mcp/
    main.ts
    recommendation-mcp.module.ts
    tools/
      get-space-business-evidence.tool.ts
      get-business-location-evidence.tool.ts
      search-business-categories.tool.ts
  modules/recommendations/
    application/
      use-cases/
      ports/
    infrastructure/
      openai/
      persistence/
```

로컬 개발은 `stdio`도 가능하지만, Responses API가 직접 호출하는 운영 MCP는
네트워크 접근 가능한 원격 MCP URL이 필요하다. 외부 공개가 곤란하면 Secure MCP
Tunnel 사용을 검토한다.

## 4. MCP 도구 계약

UI 기능은 두 개지만 MCP에는 분석용 도구 두 개와 업종 정규화용 보조 도구 한 개를
둔다. 지나치게 작은 조회 도구를 여러 개 노출하면 AI 호출 횟수·비용·실패 지점이
늘어나므로, 분석 한 번에 필요한 근거를 한 패킷으로 반환한다.

### 4.1 `search_business_categories`

사용자 표현을 DB의 표준 업종 코드 후보로 변환한다.

입력 예시:

```json
{
  "query": "브런치 카페",
  "limit": 5
}
```

출력:

- `business_category_code`
- `name`, `group_name`
- 일치 점수와 일치 사유
- 매출 통계 지원 여부

한 후보의 일치도가 충분히 높으면 자동 선택하고, 모호하면 UI에서 사용자가 업종을
고르게 한다. AI가 존재하지 않는 업종 코드를 생성해서는 안 된다.

### 4.2 `get_space_business_evidence`

주어진 공간에 적합한 업종 후보와 비교 근거를 반환한다.

주요 입력:

```json
{
  "address": "서울특별시 ...",
  "building_id": null,
  "exclusive_area_sqm": 66.1,
  "floor": 1,
  "deposit_krw": 30000000,
  "monthly_rent_krw": 2500000,
  "parking": "AVAILABLE",
  "radius_meters": 500,
  "limit": 20,
  "weights": null,
  "as_of": null
}
```

처리 순서:

1. 주소를 건물과 연결하고 실패 시 좌표 또는 후보 주소를 반환한다.
2. `commercial_area_building` 또는 PostGIS 공간 연산으로 상권을 결정한다.
3. 상권별 업종 피처, 인근 점포 분포, 유동인구, 용도지역, 공실률·임대료 근거를
   같은 기준 시점으로 수집한다.
4. 영업 불가능한 용도·층·면적 조건을 하드 필터로 제거한다.
5. 업종 후보를 결정론적으로 채점하고 상위 20개와 근거를 반환한다.

출력 핵심:

```json
{
  "analysis_mode": "SPACE_TO_BUSINESS",
  "subject": {},
  "resolved_context": {},
  "data_as_of": {},
  "methodology_version": "space-business-v1",
  "candidates": [
    {
      "business_category_code": "...",
      "business_category_name": "...",
      "pre_score": 82.4,
      "score_breakdown": {},
      "evidence": [],
      "risks": [],
      "missing_fields": []
    }
  ],
  "missing_reasons": []
}
```

### 4.3 `get_business_location_evidence`

희망 업종과 예산에 맞는 상권 및 건물 후보를 반환한다.

주요 입력:

```json
{
  "business_category_code": "...",
  "budget": {
    "deposit_max_krw": 50000000,
    "monthly_rent_max_krw": 3000000
  },
  "required_area_sqm": { "min": 50, "max": 90 },
  "preferred_regions": ["마포구", "서대문구"],
  "preferred_floors": [1, 2],
  "parking_required": false,
  "limit": 20,
  "weights": null,
  "as_of": null
}
```

처리 순서:

1. 표준 업종 코드를 검증한다.
2. 선호 지역과 예산으로 상권을 1차 필터링한다.
3. 수요, 경쟁, 부족 업종, 폐업 위험, 유동인구 적합도, 임대료 적합도를 계산한다.
4. 상위 상권 안에서 면적·층·용도 조건을 만족하는 건물을 조회한다.
5. 실제 공실 매물 데이터가 있는 경우에만 공실 건물로 표시하고, 그렇지 않으면
   `BUILDING_CANDIDATE`로 명확히 표시한다.

출력은 상권 점수와 건물 점수를 분리한다. 건물 단위 임대 조건을 알 수 없으면
상권 평균 임대료를 `PROXY`로 표시하고 정확한 예산 충족으로 단정하지 않는다.

## 5. 유즈케이스와 서비스 로직

### 5.1 업종 표현 정규화

현재 표준 업종은 약 100개이므로 임베딩만으로 매핑하지 않는다. 다음 순서의
하이브리드 검색을 사용한다.

1. `CS...` 코드 및 표준 업종명 완전 일치
2. 사용자 검색어 정규화 후 별칭 사전 완전 일치
3. 토큰/부분 문자열/PostgreSQL trigram 유사도 검색
4. 앞 단계의 신뢰도가 낮을 때만 임베딩 유사도 검색
5. 점수 차이가 작거나 복합 업종이면 하나로 강제하지 않고 확인 후보 반환

예를 들어 `브런치 카페`는 `커피-음료`와 `양식음식점` 양쪽 의미를 가질 수 있다.
이를 무조건 하나의 코드로 바꾸면 이후 통계가 왜곡된다. 다음과 같이 결과를
반환해 사용자가 주업종을 고르거나, 복합 업종 분석을 명시적으로 요청하게 한다.

```json
{
  "query": "브런치 카페",
  "candidates": [
    { "code": "CS100010", "name": "커피-음료", "confidence": 0.91 },
    { "code": "CS100004", "name": "양식음식점", "confidence": 0.74 }
  ],
  "resolution": "NEEDS_CONFIRMATION"
}
```

사용자 표현용 별칭은 원천 데이터 분류를 연결하는 기존
`store_category_mapping`과 목적이 다르므로 별도 테이블로 관리한다.

```text
business_category_alias
- id
- business_category_code
- alias / normalized_alias
- source (CURATED, USER_CONFIRMED, IMPORTED)
- status (ACTIVE, REVIEW, REJECTED)
- priority
- created_at / updated_at
```

임베딩을 추가할 때에는 표준명 하나만 임베딩하지 않고 `표준명 + 별칭 + 대표 상품 +
포함/제외 설명`으로 카테고리 문서를 만든다. 벡터 검색 결과도 최종 확정값이 아니라
후보 생성 신호로만 사용한다.

`SearchBusinessCategoriesUseCase` 로직:

```text
normalize(query)
  → exactCodeOrName()
  → findActiveAliases()
  → lexicalSearch()
  → embeddingFallbackWhenNeeded()
  → mergeAndDeduplicate()
  → applyConfidencePolicy()
  → resolved | needs_confirmation | not_found
```

### 5.2 공간 → 업종 후보 생성

`GetSpaceBusinessEvidenceUseCase`는 다음 애플리케이션 서비스를 조합한다.

```text
ValidateSpaceConditionService
  → ResolveBuildingContextService
  → ResolveAnalysisPeriodService
  → LoadBusinessCandidateStatisticsService
  → FilterEligibleBusinessCategoriesService
  → CalculateSpaceBusinessScoreService
  → BuildEvidencePacketService
```

세부 로직:

1. 면적·층·임대료·주차·반경의 형식과 허용 범위를 검증한다.
2. 주소 또는 `building_id`를 건물과 상권에 연결하고 용도지역을 공간 조인한다.
3. 지표별 최신 시점을 확인해 최신 공통 분석 분기를 결정한다.
4. 통계가 존재하는 표준 업종을 1차 후보로 가져온다.
5. 법적/물리적 조건을 만족하지 않는 업종을 하드 필터링한다.
6. 남은 업종별 수요·공급 부족·고객층·경쟁 건전성·임대료·공간 적합도를
   0~100으로 정규화한다.
7. 버전이 있는 가중치로 사전 점수를 계산한다.
8. 상위 후보와 점수 구성, 원시 근거, 결측·위험 요인을 반환한다.

층·면적·주차가 어떤 업종에 중요한지는 상권 통계만으로 알 수 없으므로 별도 업종
프로파일이 필요하다. 초기에는 검토 가능한 YAML 또는 DB 정책 테이블로 관리한다.

```text
business_category_profile
- business_category_code
- allowed/preferred_floor_rules
- recommended_area_range
- parking_importance
- target_age/time/day profile
- rent_burden_threshold
- compatible_building_uses
- policy_version
```

해커톤 MVP에서는 이를 `business_category_analysis_profile` 테이블의
`hackathon-v1`/`AI_HEURISTIC` 프로파일로 구현한다. 보편적 업종 특성을 구조화한
가정이므로 신뢰도는 `LOW`로 저장하고 전체 추천 점수에서 제한적으로 사용한다.

### 5.3 업종 → 상권/건물 후보 생성

`GetBusinessLocationEvidenceUseCase`의 서비스 흐름은 다음과 같다.

```text
ValidateBusinessConditionService
  → ResolveBusinessCategoryService
  → ResolveAnalysisPeriodService
  → FilterCommercialAreasService
  → CalculateAreaBusinessFitScoreService
  → FindBuildingCandidatesService
  → CalculateBuildingConstraintScoreService
  → BuildEvidencePacketService
```

세부 로직:

1. 업종이 확정되지 않았으면 `search_business_categories` 결과로 먼저 확정한다.
2. 선호 행정구역, 예산, 최소 통계 충족 여부로 상권을 1차 필터링한다.
3. 해당 업종의 수요·공급 부족·경쟁 건전성·폐업 위험·유동인구 적합도를 계산한다.
4. 상위 상권 안에서 면적·층·주용도 조건을 만족하는 건물을 검색한다.
5. 실제 매물 정보가 있으면 매물 임대료와 주차 조건을 적용한다.
6. 실제 매물 정보가 없으면 상권 평균 임대료를 대체 지표로 쓰고 건물을
   `BUILDING_CANDIDATE`로만 표시한다.
7. 상권 점수와 건물 조건 점수를 분리해 근거 패킷으로 반환한다.

### 5.4 MCP 점수와 AI 판단의 경계

MCP가 TOP 5를 결정한 뒤 AI가 같은 5개 중에서 다시 TOP 5를 고르는 구조는 피한다.
다음 두 운영 모드 중 하나를 명확히 선택해야 한다.

**결정론 우선 모드**

- AI가 자연어 조건을 구조화하고 허용 범위 안의 가중치 프로파일을 선택한다.
- MCP가 필터링과 최종 점수를 계산해 TOP 5를 확정한다.
- AI는 순위를 바꾸지 않고 근거·비교·주의사항만 설명한다.
- 결과 재현성과 테스트가 가장 중요할 때 적합하다.

**AI 재정렬 모드**

- MCP가 하드 필터와 기본 가중치로 상위 15~20개 후보를 반환한다.
- AI가 사전 프롬프트의 정해진 평가표로 그 후보 안에서 최종 TOP 5를 선택한다.
- AI는 후보 밖 항목을 추가하거나 MCP 수치를 변경할 수 없다.
- 선택된 각 항목에 `pre_score`, 선택 이유, 제외 후보 대비 장점을 남긴다.

초기 운영은 **결정론 우선 모드**를 권장한다. 즉, AI가 사용자의 표현을 구조화하고
설명은 풍부하게 만들되 순위는 MCP가 계산한다. 이후 골든 케이스와 전문가 평가가
쌓이면 AI 재정렬 모드를 실험 플래그로 도입해 두 결과를 비교한다.

현재 도구명이 `get_*_evidence`인 상태에서 AI 재정렬 모드를 채택한다면 상위 15~20개를
반환한다. 결정론 우선 모드로 확정한다면 책임이 이름에 드러나도록 다음처럼 바꾼다.

- `rank_businesses_for_space`
- `rank_locations_for_business`

## 6. 데이터 연결표와 현재 제약

| 분석 항목 | 주 데이터 | 상태/처리 원칙 |
|---|---|---|
| 상권 경계 | `commercial_area` | 사용 가능 |
| 건물-상권 연결 | `commercial_area_building` | 사용 가능, 중첩률 근거 보존 |
| 건물 기본 정보 | `building` | 주소·면적·층·주용도 후보 검색에 사용 |
| 업종 분포/수요/경쟁 | `area_business_feature`, `store`, `business_category` | 사용 가능, 경쟁 점수의 방향을 산식에 명시 |
| 유동인구 | `commercial_area_floating_population_statistic` | 2025Q1~2026Q2, 9,892행 적재 완료 |
| 용도지역 | `land_use_zone` | 공간 조인 필요 |
| 상권 임대료 | `rent_statistic`, `commercial_area_feature` | 적재량·최신성 검증 후 사용 |
| 공실률 | REB 공실률 스키마 | 조사 권역 단위 통계이며 개별 공실 건물 목록이 아님 |
| 실제 공실 매물 | 현재 전용 테이블 없음 | 업종→건물 기능의 선행 데이터 |
| 주차 | 첫 기능은 사용자 입력 사용 가능 | 두 번째 기능은 건물/매물 데이터 추가 필요 |
| 도로 접근성 | 직접 피처 없음 | 도로망 데이터 추가 또는 명시적 대체 지표 필요 |

### 가장 중요한 범위 제한

현재 DB만으로 두 번째 기능에서 **실제로 임대 가능한 공실 건물**을 확정 추천할 수는
없다. REB 공실률은 조사 권역 통계이지 매물 목록이 아니다. 초기 MVP는 화면 문구를
`건물 후보`로 유지하고, 실제 공실 추천을 제공하려면 다음 테이블과 데이터 공급원이
필요하다.

```text
vacancy_listing
- id
- building_id
- source / source_listing_id
- status
- floor
- exclusive_area_sqm
- deposit_krw / monthly_rent_krw / maintenance_fee_krw
- parking_available
- available_from
- observed_at
- source_url
- raw_payload jsonb
- UNIQUE(source, source_listing_id)
```

도로 접근성이 필수 평가 요소라면 도로 중심선·도로 폭·출입구 거리 등의 GIS 원천을
추가한다. 데이터 확보 전에는 지하철/버스 거리나 상권 중심 거리 같은 대체 지표를
`PROXY`로만 사용한다.

## 7. 초기 점수 산식

점수는 0~100으로 정규화한다. 초기 가중치는 운영 데이터와 전문가 검토 전의
가설이며, 반드시 `methodology_version`과 함께 저장한다.

### 공간 → 업종

| 항목 | 가중치 | 설명 |
|---|---:|---|
| 수요 강도 | 25 | 매출·수요 점수·유동인구 기반 |
| 공급 부족도 | 20 | 수요 대비 점포 수, 인근 업종 공백 |
| 고객층 적합도 | 20 | 연령·성별·시간대·요일 유동인구 |
| 경쟁 건전성 | 15 | 단순 저경쟁이 아니라 수요와 폐업률을 함께 평가 |
| 임대료 적합도 | 10 | 입력 임대료와 상권 수준 비교 |
| 용도·건물 적합도 | 5 | 용도지역, 주용도, 층·면적 |
| 접근성 | 5 | 확보된 실제 지표 또는 명시된 대체 지표 |

### 업종 → 지역/건물

| 항목 | 가중치 | 설명 |
|---|---:|---|
| 업종 수요 | 25 | 상권 수요와 예상 고객층 |
| 경쟁/기회 | 20 | 경쟁 밀도, 공급 부족, 폐업률 결합 |
| 예산 적합도 | 20 | 실제 매물 임대료 우선, 상권 평균은 대체 지표 |
| 유동인구 적합도 | 15 | 업종 타깃 시간·연령과 비교 |
| 공실 기회 | 10 | 권역 공실률 또는 실제 매물 존재 여부 |
| 공간 조건 적합도 | 10 | 면적·층·용도·주차 조건 |

`competition_score`가 높다는 이유만으로 무조건 감점하지 않는다. 경쟁 점포가 많다는
것은 수요가 검증된 상권일 수도 있으므로, 수요·점포당 매출·폐업률과 결합해
`opportunity_score`를 새로 계산한다.

## 8. AI 사전 프롬프트 설계

사전 프롬프트는 MCP 서버가 아니라 Recommendation Orchestrator가 소유한다. MCP
도구 설명에는 입력·출력 의미만 적고, 평가 정책은 버전이 있는 developer prompt로
관리한다.

공통 규칙:

1. MCP 응답에 없는 통계나 사실을 만들지 않는다.
2. MCP 후보 밖의 업종·상권·건물을 추천하지 않는다.
3. `MEASURED`, `DERIVED`, `PROXY`를 구분해 설명한다.
4. 데이터 기준 시점과 결측 항목을 결과에 포함한다.
5. 총점뿐 아니라 추천 근거 3개, 위험 요인 1개 이상을 제공한다.
6. 통계적 추천은 성공·수익 보장이 아님을 명시한다.
7. 동일 후보의 장점과 약점을 함께 설명하고 과도한 확신 표현을 금지한다.
8. 지정한 JSON Schema로만 최종 응답한다.

최종 응답 공통 형태:

```json
{
  "request_id": "...",
  "analysis_mode": "SPACE_TO_BUSINESS",
  "summary": "...",
  "recommendations": [
    {
      "rank": 1,
      "candidate_type": "BUSINESS_CATEGORY",
      "candidate_id": "...",
      "name": "...",
      "total_score": 82.4,
      "score_breakdown": {},
      "reasons": [],
      "risks": [],
      "evidence_ids": []
    }
  ],
  "data_as_of": {},
  "missing_data": [],
  "disclaimer": "..."
}
```

프롬프트 템플릿 ID/버전, 모델, MCP 도구 호출 결과 해시, 점수 산식 버전을 요청과
함께 저장한다.

## 9. API와 결과 저장 구조

권장 HTTP API:

- `POST /api/recommendations/space-to-business`
- `POST /api/recommendations/business-to-location`
- `GET /api/recommendations/:requestId`

현재 `recommendation_result`는 `building_id`가 필수라서 공간→업종 결과를 저장할 수
없다. 기존 테이블을 억지로 nullable/general-purpose로 만들기보다 요청에는
`analysis_mode`, `status`, `prompt_version`, `methodology_version`, `data_as_of`를
추가하고 결과는 다음처럼 목적별로 나누는 안을 권장한다.

- `space_business_recommendation_result`
  - `request_id`, `business_category_code`, `rank`, `total_score`
  - `score_breakdown`, `evidence`, `explanation`, `risks`
- `location_recommendation_result`
  - `request_id`, `commercial_area_code`, `building_id nullable`
  - `candidate_type`, `rank`, `total_score`
  - `score_breakdown`, `evidence`, `explanation`, `risks`
- `recommendation_tool_trace`
  - 도구명, 입력 해시, 출력 스냅샷 또는 저장 위치, 실행 시간, 오류

모델 호출이 길어질 수 있으므로 요청을 `PENDING → ANALYZING → COMPLETED/FAILED`로
관리하고, 프론트는 폴링 또는 SSE로 상태를 받도록 한다.

## 10. 보안·운영

- MCP 전용 PostgreSQL 역할에는 필요한 뷰와 `SELECT` 권한만 부여한다.
- MCP 인자에 SQL 조각, 테이블명, 정렬 표현식을 받지 않는다.
- 입력 최대 길이, 검색 반경, 반환 후보 수, 쿼리 타임아웃을 제한한다.
- API→MCP 인증은 초기에는 회전 가능한 서비스 토큰을 사용하고, 외부 클라이언트에
  직접 공개할 때 OAuth로 전환한다.
- 읽기 전용 도구만 자동 승인 대상으로 설정하고, 허용 도구 목록을 요청별로 제한한다.
- 주소와 예산 같은 사용자 입력은 로그에서 마스킹하고 보존 기간을 정한다.
- MCP 응답에 원본 geometry나 대용량 행 목록을 넣지 않는다.
- 도구별 호출 수, DB 지연, 모델 지연, 토큰 비용, 결측률을 관측한다.

## 11. 구현 단계

### 단계 0 — 데이터 준비성 확정

- 핵심 테이블별 행 수, 최신 기준 분기, 결측률을 자동 점검하는 SQL 작성
- `rent_statistic`/`commercial_area_feature`의 실제 적재 상태 검증
- 실제 공실 매물 공급원 도입 여부 결정
- 도로 접근성 지표의 원천 또는 대체 지표 결정

완료 기준: 두 기능 각각에서 `실측`, `파생`, `대체`, `미제공` 항목이 문서화된다.

### 단계 1 — 계약과 산식 고정

- MCP 3개 도구의 JSON Schema 작성
- 두 분석 모드의 점수 산식 v1 작성
- 기준 분기 선택 규칙과 결측 처리 규칙 작성
- AI 최종 응답 JSON Schema와 developer prompt v1 작성

완료 기준: 샘플 입력 2개에 대해 모델 없이도 MCP 예상 응답을 생성할 수 있다.

### 단계 2 — 조회/점수 애플리케이션 계층

- 주소→건물→상권 해석 유스케이스
- 업종 정규화 유스케이스
- 공간→업종 후보 조회 및 채점
- 업종→상권/건물 후보 조회 및 채점
- 최신 공통 분기 조회용 view 또는 query builder 구성

완료 기준: 같은 DB 스냅샷과 입력에 대해 후보 순서·점수가 항상 동일하다.

### 단계 3 — MCP 서버

- 공식 TypeScript MCP SDK 도입
- Streamable HTTP 진입점과 health check 구현
- 3개 도구 등록, 입력 검증, 표준 오류 응답 구현
- read-only DB 계정, 인증, rate limit, statement timeout 적용

완료 기준: MCP Inspector/계약 테스트에서 도구 목록과 샘플 호출이 성공한다.

### 단계 4 — AI 오케스트레이터

- OpenAI Responses API 클라이언트 연결
- 원격 MCP 도구, 허용 도구, 승인 정책 설정
- 분석 모드별 developer prompt 적용
- Structured Outputs로 최종 JSON 강제
- 요청 상태와 도구 근거, 최종 결과 저장

완료 기준: 모든 추천 항목의 `candidate_id`와 `evidence_ids`가 MCP 응답에 실제로
존재한다.

### 단계 5 — API/프론트 연동

- 두 POST API와 상태 조회 API 구현
- 입력 DTO와 사용자 친화적 오류 코드 정의
- 주소/업종 모호성 확인 UX, 분석 진행 상태, 기준 시점·결측 표시 연결

완료 기준: 이미지의 두 진입점에서 TOP 5 결과 화면까지 end-to-end로 동작한다.

### 단계 6 — 평가와 운영 안정화

- 공간→업종 10건, 업종→지역 10건 이상의 골든 케이스 작성
- 전문가 검토와 사용자 피드백으로 가중치 보정
- 프롬프트 회귀 평가, 환각 검출, 후보 외 추천 방지 테스트
- 부하·타임아웃·MCP 장애·데이터 결측 테스트

완료 기준: 아래 품질 기준을 충족하고 버전별 평가 결과가 남는다.

## 12. 테스트 및 수용 기준

- MCP 도구는 DB 변경 쿼리를 실행할 수 없다.
- MCP 데이터 조회 p95 목표는 2초 이내다(모델 응답 시간 제외).
- 도구 응답은 기본 100KB 이하, 후보는 최대 50개다.
- 최종 TOP 5의 모든 ID와 수치는 MCP 근거로 역추적할 수 있다.
- 존재하지 않는 주소·업종 코드·기준 분기에 대해 명확한 오류를 반환한다.
- 임대료·주차·공실 매물 데이터가 없으면 적합 판정을 만들지 않고 결측으로 표시한다.
- 동일 데이터 스냅샷·입력·산식 버전에서 MCP 사전 순위는 동일하다.
- 프롬프트 변경 전후 골든 케이스 회귀 결과를 비교할 수 있다.
- 추천 결과에 데이터 기준 시점과 의사결정 보조용이라는 고지가 포함된다.

## 13. 1차 MVP 범위 제안

가장 빠르고 검증 가능한 MVP는 다음 범위다.

1. 서울 내 상권과 현재 보유 건물만 대상으로 한다.
2. 2025Q1~2026Q2 중 지표별 최신 공통 분기를 사용한다.
3. 공간→업종 추천은 사용자 입력 임대료·주차 정보를 사용한다.
4. 업종→지역 추천은 우선 상권 TOP 5를 정확히 제공한다.
5. 건물은 용도·면적·층 조건을 만족하는 `후보`로만 제공한다.
6. 실제 공실 매물 데이터가 적재된 뒤 `임대 가능한 공실 건물 추천`으로 확장한다.

이 순서라면 불완전한 매물 데이터 때문에 전체 MCP 개발이 막히지 않으면서도,
첫 기능과 상권 추천 품질을 먼저 평가할 수 있다.

## 14. 구현 전 결정할 사항

1. AI 호출은 OpenAI Responses API로 확정할지
2. MVP에서 실제 공실 매물 수집을 포함할지, 건물 후보까지만 제공할지
3. 임대료 데이터의 출처와 갱신 주기
4. 도로 접근성의 정의(도로 폭, 대로변 여부, 역/정류장 거리 등)
5. 업종별 고객층 규칙을 수작업 정책표로 둘지 데이터로 학습·추정할지
6. 추천 가중치를 사용자에게 노출·조정 가능하게 할지

## 참고

- OpenAI MCP 및 Connectors 가이드:
  https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- OpenAI Responses API Create reference:
  https://developers.openai.com/api/reference/cli/resources/responses/methods/create
