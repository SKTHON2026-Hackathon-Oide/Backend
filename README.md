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

`.env`의 `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` 값은
`infra/databases/.env`의 `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`와
동일해야 한다.

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/health`

## Database migrations

TypeORM `synchronize`는 사용하지 않는다. 스키마 변경은 `src/database/migrations`에 migration을 추가하고 `npm run migration:run`으로 적용한다.
