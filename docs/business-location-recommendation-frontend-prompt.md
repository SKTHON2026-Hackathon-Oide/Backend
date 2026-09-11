# 프론트엔드 구현용 프롬프트

아래 프롬프트를 프론트엔드 개발 에이전트 또는 담당자에게 전달하세요.

---

당신은 SKTHON 프론트엔드 개발자입니다. 업종·선호지역·영업시간을 입력받아 상권 추천 API를 연결하고, 비동기 분석 진행 상황과 TOP5 결과를 화면에 표시하세요.

## 입력 화면

1. 화면 진입 시 `GET /api/v1/business-categories?analysisSupported=true`를 호출합니다.
2. 응답은 일반 API이므로 `{ success: true, data: { categories: [...] } }` 형태입니다.
3. 드롭다운에는 `code`를 값으로, `name`을 라벨로 사용하고 `categoryGroup`으로 그룹을 표시합니다.
4. VWorld 검색/지도에서 선택한 위치의 WGS84 좌표를 보관합니다. 경도는 `longitude`, 위도는 `latitude`로 숫자를 전송합니다. 문자열 지역명이나 VWorld 코드를 분석 요청의 기준값으로 사용하지 마세요.
5. 영업 시작·종료 시간은 `HH:mm` 형식의 15분 단위만 허용합니다. 자정을 넘는 시간(예: `18:00`~`02:00`)도 허용합니다.

선택된 좌표를 화면에 표시할 행정구역명이 필요하면 다음 API를 사용할 수 있습니다.

```http
POST /api/v1/administrative-areas/resolve
Authorization: Bearer <clerk-session-token>
Content-Type: application/json

{"longitude":127.0365,"latitude":37.5442}
```

## 분석 요청

분석 시작 버튼에서 다음 API를 호출합니다.

```http
POST /api/v1/business-location-recommendation-requests
Authorization: Bearer <clerk-session-token>
Idempotency-Key: <uuid>
Content-Type: application/json

{
  "businessCategoryCode": "CS100010",
  "preferredLocation": { "longitude": 127.0365, "latitude": 37.5442 },
  "operatingHours": { "opensAt": "09:00", "closesAt": "22:00" }
}
```

`Idempotency-Key`는 분석 버튼을 누를 때마다 새 UUID를 만들고, 네트워크 재시도에서는 같은 값을 유지합니다. 서버는 `202 Accepted`와 요청 ID를 반환합니다.

```json
{
  "success": true,
  "data": {
    "requestId": "12345",
    "status": "QUEUED",
    "eventsUrl": "/api/v1/recommendation-requests/12345/events",
    "resultUrl": "/api/v1/recommendation-requests/12345"
  }
}
```

상대 경로 URL은 현재 API origin에 붙여 사용합니다. 사용자가 다른 요청 ID를 보고 있지 않은지 확인한 뒤에만 해당 요청의 이벤트를 구독하세요.

## SSE 진행 상황

`GET {eventsUrl}`를 `EventSource` 또는 인증 헤더를 지원하는 SSE 클라이언트로 구독합니다. 브라우저 기본 `EventSource`는 Authorization 헤더를 보낼 수 없으므로 Clerk 토큰을 붙일 수 있는 `fetch` 기반 SSE 구현 또는 프로젝트의 인증 SSE 유틸을 사용하세요.

SSE 응답은 일반 response interceptor를 거치지 않으며 이벤트는 다음 타입을 사용합니다.

- `connected`: 연결 직후 현재 상태
- `progress`: `stage`, `progress`, `message`
- `tool_started`: MCP 근거 수집 시작
- `tool_completed`: 후보 수와 기준 시점
- `warning`: 결측 데이터 또는 대체 지표
- `completed`: 최종 결과
- `failed`: 오류 코드와 재시도 가능 여부
- `heartbeat`: 15초 연결 유지 신호

마지막으로 처리한 이벤트의 `id`를 저장하고 재연결 시 `Last-Event-ID` 헤더로 전달합니다. SSE가 끊겨도 분석이 취소된 것은 아니므로 먼저 결과 API를 조회하세요.

```ts
type ProgressEvent = {
  stage:
    | 'QUEUED'
    | 'RESOLVING_LOCATION'
    | 'COLLECTING_EVIDENCE'
    | 'SCORING_WITH_AI'
    | 'VALIDATING_RESULT';
  progress: number;
  message: string;
};
```

`completed` 또는 `failed`를 받으면 SSE를 닫고 결과 API를 한 번 더 조회해 화면 상태를 확정합니다. `connected.status`가 이미 `COMPLETED` 또는 `FAILED`인 경우에도 이벤트 본문을 기다리지 말고 즉시 결과 API를 조회합니다.

SSE의 정상 종료, 네트워크 오류, 이벤트 파싱 오류만으로 “분석 결과를 받지 못했습니다” 오류를 표시하지 마세요. 모든 종료 경로에서 `GET {resultUrl}`을 먼저 호출하고, 분석 중에는 2~3초 간격의 상태 조회를 SSE와 병행합니다. GET 응답의 `status`와 `result`를 최종 진실 공급원으로 취급합니다.

## 결과 조회 및 화면 표시

```http
GET /api/v1/recommendation-requests/12345
Authorization: Bearer <clerk-session-token>
```

응답은 `{ success: true, data: ... }`입니다. `status`가 `QUEUED`, `RESOLVING_LOCATION`, `COLLECTING_EVIDENCE`, `SCORING_WITH_AI`, `VALIDATING_RESULT`이면 진행 화면을 표시하고, `COMPLETED`이면 결과를 표시합니다.

완료 결과의 핵심 구조는 다음과 같습니다.

```ts
type Result = {
  analysisType: 'BUSINESS_TO_AREA';
  preferredArea: {
    id: string;
    code: string;
    name: string;
    areaType: string;
    parentCode: string | null;
    parentName: string | null;
    matchMethod: 'CONTAINS' | 'BOUNDARY';
  };
  businessCategory: { code: string; name: string };
  operatingHours: { opensAt: string; closesAt: string };
  recommendations: Array<{
    rank: number;
    commercialAreaId: string;
    commercialAreaCode: string;
    commercialAreaName: string;
    administrativeArea: { code: string | null; name: string | null };
    longitude: number | null;
    latitude: number | null;
    totalScore: number;
    scoreBreakdown: {
      demand: number;
      supplyOpportunity: number;
      customerFit: number;
      timeFit: number;
      competitionHealth: number;
      dataConfidence: number;
    };
    oneLineReason: string;
    evidence: Array<{
      metric: string;
      value: string | number | null;
      unit: string | null;
      interpretation: string;
    }>;
    operatingHourFit: {
      score: number;
      matchedTimeBands: string[];
      explanation: string;
    };
    risks: string[];
    operatingTips: string[];
    evidenceIds: string[];
  }>;
  warnings: string[];
  dataLimitations: string[];
  dataAsOf: {
    commerce: string | null;
    floatingPopulation: string | null;
    profile: string | null;
  };
};
```

결과 UI 규칙:

- `recommendations`를 `rank` 오름차순으로 최대 5개 카드에 표시합니다.
- 카드 요약에는 상권명, `totalScore`, `oneLineReason`만 우선 표시합니다.
- 상세 영역에는 `scoreBreakdown`, `evidence`, `operatingHourFit`, `risks`, `operatingTips`를 표시합니다.
- `matchedTimeBands`의 `00:00-06:00` 같은 내부 시간대는 `00~06시`로 변환합니다.
- 점수나 수치가 null이면 0으로 표시하지 말고 “데이터 확인 필요”와 같이 결측 상태를 표시합니다.
- `warnings`와 `dataLimitations`는 결과 하단에 표시합니다.
- 분석 결과는 성공·매출·수익을 보장하는 문구로 바꾸지 않습니다.
- 상권 좌표가 있으면 지도에 마커를 표시하되, 실제 공실이나 임대 가능 매물로 표현하지 않습니다.

## 오류 처리

다음 오류는 사용자에게 원인을 안내하고 재요청 가능 상태로 만듭니다.

- `BUSINESS_CATEGORY_NOT_FOUND`: 업종을 다시 선택
- `ADMINISTRATIVE_AREA_NOT_FOUND`: 지도에서 서울 내 위치를 다시 선택
- `ADMINISTRATIVE_AREA_NOT_FOUND`: 서울시 분석 범위 밖이거나 행정구역 데이터에 없는 위치
- `INSUFFICIENT_EVIDENCE`: 선택 지역·업종의 통계 부족
- `IDEMPOTENCY_KEY_REUSED`: 기존 요청과 다른 내용으로 같은 키를 사용한 경우 새 키 발급
- `MODEL_TIMEOUT`, `CODEX_AGENT_RUNNER_ERROR`: 결과 조회 후 필요하면 같은 요청 데이터를 새 멱등키로 재시도

Clerk 세션이 만료되면 먼저 토큰을 갱신한 뒤 동일한 `requestId`를 결과 API에서 재조회합니다. 인증 토큰이나 API 키를 localStorage, URL, 분석 결과에 저장하지 마세요.

## 완료 조건

- 업종 목록이 DB 기준으로 로드되고 드롭다운에서 선택된다.
- VWorld 선택 좌표가 백엔드 행정구역명·코드로 확정된다.
- 분석 요청 후 진행률과 MCP 근거 수집 상태가 표시된다.
- SSE 단절 후 `Last-Event-ID`로 재연결할 수 있다.
- 완료 시 상권 TOP5와 수치 근거·위험·영업시간 적합성이 표시된다.
- 결측값과 API 오류가 사용자에게 이해 가능한 문구로 노출된다.

---
