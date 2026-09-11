# 레포트 찜 DB 저장

모든 요청은 Clerk 세션의 Authorization: Bearer 토큰이 필요합니다.
사용자 ID는 요청에 보내지 않으며 백엔드가 인증된 사용자를 결정합니다.

- GET /api/v1/report-favorites: 본문을 제외한 내 목록
- PUT /api/v1/report-favorites: 저장/갱신
- GET /api/v1/report-favorites/{id}: 본문 포함 조회
- DELETE /api/v1/report-favorites/{id}: 찜 취소

PUT body: `{ id, kind, title, address?, label?, summary?, score?, report }`.
kind는 vacancy 또는 location, report는 분석 결과 JSON 객체입니다.
본문을 JSON.stringify한 UTF-8 크기가 최대 3,145,728바이트(3MiB)입니다.
초과 시 413, 타인의 레포트 또는 없는 레포트 조회 시 404를 반환합니다.
같은 사용자/id의 재저장은 중복 레코드를 만들지 않습니다.

배포 전 npm run build 및 npm run migration:run:prod를 실행합니다.
서버 JSON 요청 한도는 메타데이터 여유를 포함해 4MB입니다.
운영 Nginx 등 앞단 프록시에도 client_max_body_size 4m 이상의 설정이 필요합니다.
이 저장소에는 운영 프록시 설정이 포함되어 있지 않습니다.

기존 localStorage/Clerk 메타데이터 내용은 삭제하지 않지만 자동 이관하지 않습니다.
신규 찜과 DB 목록 조회는 백엔드 배포 및 마이그레이션 이후 가능합니다.
