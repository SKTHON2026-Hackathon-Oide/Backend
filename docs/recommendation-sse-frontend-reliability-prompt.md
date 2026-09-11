# 추천 API 프론트엔드 안정성 보강 프롬프트

아래 프롬프트를 공실추천(건물 기준 업종 추천)과 입지추천(업종 기준 상권 추천)을 연결하는 프론트엔드 개발 에이전트에게 전달하세요.

---

당신은 SKTHON 프론트엔드 개발자입니다. 추천 분석의 SSE 연결이 끊기거나 완료 이벤트가 늦게 도착하더라도 DB에 저장된 결과를 놓치지 않도록 두 추천 화면의 비동기 연동을 보강하세요.

## 적용 API

- 공실추천 생성: `POST /api/v1/buildings/{buildingId}/recommendation-requests`
- 입지추천 생성: `POST /api/v1/business-location-recommendation-requests`
- 공통 SSE: `GET /api/v1/recommendation-requests/{requestId}/events`
- 공통 상태·결과: `GET /api/v1/recommendation-requests/{requestId}`

생성 응답의 `requestId`, `eventsUrl`, `resultUrl`을 그대로 보관하세요. 상대 URL은 API origin을 기준으로 해석합니다. 네트워크 재시도에는 같은 `Idempotency-Key`를 사용하고, 사용자가 새 분석을 시작할 때만 새 UUID를 발급합니다.

## 단일 진실 공급원

SSE는 빠른 진행 표시용이며 `GET {resultUrl}` 응답을 최종 진실 공급원으로 사용하세요. 다음 상황에서는 오류를 표시하기 전에 반드시 결과 API를 조회합니다.

- `completed` 또는 `failed` 이벤트 수신
- `connected` 이벤트의 `status`가 `COMPLETED` 또는 `FAILED`
- SSE가 정상 종료됨
- SSE 네트워크 오류 또는 이벤트 파싱 오류
- 브라우저가 백그라운드에서 복귀함
- 최대 대기 시간에 도달함

SSE가 끝났는데 `completed` 이벤트 본문을 못 받았다는 이유만으로 “분석정보를 받지 못했습니다”를 표시하지 마세요. GET 응답이 `COMPLETED`이고 `result`가 있으면 즉시 성공 화면으로 전환합니다.

## 권장 상태 머신

`idle -> submitting -> analyzing -> completed | failed`

- 생성 API 성공 직후 `analyzing`으로 전환합니다.
- 현재 `requestId`별로 SSE 구독 하나와 2.5초 간격 폴링 하나를 병행합니다.
- `QUEUED`, `RESOLVING_LOCATION`, `COLLECTING_EVIDENCE`, `SCORING_WITH_AI`, `VALIDATING_RESULT`는 계속 분석 중입니다.
- `COMPLETED`는 `result`를 저장하고 SSE·폴링을 모두 종료합니다.
- `FAILED`는 `failure`를 저장하고 SSE·폴링을 모두 종료합니다.
- 화면 이동이나 새 분석 시작 시 이전 `AbortController`, 타이머, SSE reader를 정리합니다.
- 응답을 반영하기 전에 응답의 요청 ID가 현재 화면의 `requestId`와 같은지 검사하여 이전 요청 결과가 새 화면을 덮지 않게 합니다.

## TypeScript 구현 형태

프로젝트의 인증 fetch와 SSE 파서를 사용하되 동작은 다음 형태를 따르세요.

```ts
const TERMINAL = new Set(['COMPLETED', 'FAILED']);

async function reconcileResult(resultUrl: string, requestId: string) {
  const response = await authFetch(apiUrl(resultUrl));
  const body = await response.json();
  const data = body.data;
  if (requestId !== currentRequestId()) return 'stale';

  updateProgress(data.status, data.progress, data.stage);
  if (data.status === 'COMPLETED') {
    if (!data.result) throw new Error('COMPLETED_WITHOUT_PERSISTED_RESULT');
    showRecommendation(data.result);
    stopTransport(requestId);
    return 'completed';
  }
  if (data.status === 'FAILED') {
    showAnalysisFailure(data.failure);
    stopTransport(requestId);
    return 'failed';
  }
  return 'running';
}

async function onSseEvent(event: ParsedSseEvent, urls: RequestUrls) {
  if (event.id) saveLastEventId(urls.requestId, event.id);

  if (event.type === 'connected' && TERMINAL.has(event.data.status)) {
    await reconcileResult(urls.resultUrl, urls.requestId);
    return;
  }
  if (event.type === 'progress') updateProgressFromEvent(event.data);
  if (event.type === 'warning') appendWarning(event.data);
  if (event.type === 'completed' || event.type === 'failed') {
    await reconcileResult(urls.resultUrl, urls.requestId);
  }
}

async function onSseClosedOrErrored(urls: RequestUrls) {
  const state = await reconcileResult(urls.resultUrl, urls.requestId);
  if (state === 'running')
    scheduleSseReconnect(urls, {
      lastEventId: loadLastEventId(urls.requestId),
      backoffMs: nextBackoff(1000, 15000),
    });
}
```

`connected`와 `heartbeat`는 직전에 처리한 DB 이벤트와 같은 ID를 반복할 수 있습니다. ID가 같다는 이유로 이벤트 타입 자체를 버리지 말고, `completed`와 `failed`는 항상 결과 API 재조회 트리거로 처리하세요. `Last-Event-ID`는 숫자 문자열로 보관합니다.

폴링은 SSE 상태와 무관하게 실행하되 이전 호출이 끝나기 전에 다음 호출을 겹쳐 보내지 마세요. 탭 비활성 상태에서는 간격을 늘려도 됩니다. 5분이 지나면 마지막으로 GET을 한 번 더 호출하고, 여전히 분석 중이면 실패로 단정하지 말고 “분석이 예상보다 오래 걸리고 있습니다. 잠시 후 다시 확인해 주세요”와 재조회 버튼을 표시합니다.

## 인증 및 재연결

브라우저 기본 `EventSource`는 `Authorization` 헤더를 설정할 수 없으므로 Clerk 토큰을 넣을 수 있는 fetch 기반 SSE를 사용합니다. 401이면 토큰을 한 번 갱신한 후 같은 `requestId`로 GET과 SSE를 재시도합니다. SSE 재연결 시 저장한 이벤트 ID를 `Last-Event-ID` 헤더로 보냅니다.

## 완료 조건

- Fargate 작업 완료 직후 SSE가 끊겨도 GET 폴링으로 결과가 표시된다.
- DB 완료와 `completed` 이벤트 사이에 재연결해도 결과가 표시된다.
- `connected.status === COMPLETED`일 때 추가 이벤트를 기다리지 않는다.
- 이전 요청의 늦은 응답이 현재 요청 UI를 덮지 않는다.
- 공실추천과 입지추천이 동일한 복구 로직을 공유한다.
- “분석정보를 받지 못했습니다”는 GET까지 실패했거나 `COMPLETED`인데 DB 결과가 없는 실제 불일치에서만 표시된다.

---
