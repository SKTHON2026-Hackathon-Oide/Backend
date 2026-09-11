# 프론트 Clerk 연동 작업 프롬프트

백엔드는 이제 `X-User-Id`를 사용하지 않습니다. Clerk가 발급한 세션 토큰을
`Authorization: Bearer <token>`으로 보내고, 백엔드가 검증된 토큰의 `sub`를
현재 사용자로 사용합니다. `clerkId`나 내부 `users.id`를 body/query/header로
직접 보내지 마세요.

## 구현 요구사항

1. Clerk 로그인 상태가 준비되고 `isSignedIn === true`가 된 직후
   `PUT /api/v1/auth/register`를 호출하세요. 이 API는 멱등적이므로 앱
   초기화 때마다 호출해도 됩니다.
2. API 호출 직전에 Clerk의 `getToken()`을 `await`하여 최신 세션 토큰을
   받으세요.
3. 모든 보호 API 요청에 다음 헤더를 추가하세요.

   ```http
   Authorization: Bearer <token>
   Accept: application/json
   ```

4. `PUT /api/v1/auth/register` 응답이 성공하면 백엔드의 `users` 등록이 완료된
   상태입니다. 응답의 `id`는 내부 DB ID이므로 저장하거나 인증용으로
   재전송하지 마세요.
5. `401 UNAUTHENTICATED`가 오면 Clerk 세션을 새로 확인하고 로그인 화면으로
   이동하세요. `USER_DEACTIVATED`이면 일반 인증 실패와 구분해 사용자에게
   계정 상태를 안내하세요.

## 공통 fetch 예시 (React Clerk)

```ts
import { useAuth } from '@clerk/clerk-react';

export function useApi() {
  const { getToken } = useAuth();

  return async function apiFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
  ) {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    return fetch(input, { ...init, headers });
  };
}
```

로그인 직후 동기화 확인:

```ts
await apiFetch(`${API_URL}/api/v1/auth/register`, { method: 'PUT' });
```

다른 origin의 API 호출에서는 `getToken()`으로 얻은 토큰을 Bearer 헤더로
전달해야 합니다. Clerk 공식 문서의 [Making authenticated requests](https://clerk.com/docs/guides/development/making-requests)
방식을 따르세요.

## API별 호출 예시

```ts
await apiFetch(`${API_URL}/api/v1/space-analysis-contexts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ longitude, latitude }),
});

await apiFetch(
  `${API_URL}/api/v1/space-analysis-contexts/${contextId}/building`,
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buildingId }),
  },
);

await apiFetch(`${API_URL}/api/v1/buildings/${buildingId}/recommendation-requests`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({ userPreference }),
});
```

실제 추천 생성 경로는 백엔드 Swagger에서 확인하세요. 추천 상태 조회도 같은
Bearer 헤더를 사용합니다.

## SSE 주의사항

브라우저 기본 `EventSource`는 임의의 `Authorization` 헤더를 추가할 수
없습니다. 추천 진행 이벤트
`/api/v1/recommendation-requests/:requestId/events`는 다음 중 하나로
연동하세요.

- `fetch` 기반 SSE 클라이언트를 사용해 Bearer 토큰을 전달합니다(권장).
- 프론트와 API를 같은 origin으로 프록시해 Clerk 세션 쿠키를 사용합니다.

토큰을 URL query string에 넣지 마세요. URL이 로그·히스토리·모니터링에 남을
수 있습니다.

## 제거할 코드

- `X-User-Id` 헤더 생성 및 전달
- 내부 `users.id`를 localStorage/state에 저장해 인증에 사용하는 코드
- `clerkId`를 API body에 넣는 별도 등록 요청

인증 실패/토큰 만료/네트워크 오류를 재현하는 테스트도 추가하고, 로그인하지
않은 상태에서는 보호 API를 호출하지 않도록 하세요.
