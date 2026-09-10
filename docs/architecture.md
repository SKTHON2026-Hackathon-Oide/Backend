# SKTHON Backend Architecture

SKTHON은 하나의 NestJS 애플리케이션으로 배포되는 모듈러 모놀리스이며, 각 도메인 모듈 내부에 헥사고날 아키텍처를 적용한다.

## Module layout

```text
src/modules/{module}/
├── applications/
│   ├── commands/{usecase}/
│   ├── results/{usecase}/
│   └── usecases/{usecase}/
├── domain/
│   ├── entities/
│   ├── enums/
│   ├── ports/
│   └── services/
├── infrastructure/
│   └── persistence/typeorm/
│       ├── entities/
│       └── repositories/
├── interfaces/
│   └── http/
│       └── dto/{usecase}/
└── test/{usecase}/
```

## Dependency rules

- Controller는 Request DTO를 검증하고 Command를 생성한 뒤 UseCase만 호출한다.
- UseCase는 Domain Port를 통해서만 영속성·외부 시스템에 접근한다.
- TypeORM Entity와 DataSource는 infrastructure 밖으로 노출하지 않는다.
- Repository Adapter는 Domain Port를 구현한다.
- UseCase 결과는 Result로 반환하고, Controller가 Response DTO로 변환한다.
- 모듈 간 통신은 공개된 Application 계약 또는 Domain Event를 사용한다.

## Database

TypeORM의 `synchronize`는 사용하지 않으며 `src/database/migrations`를 통해 스키마를 관리한다. GIS 데이터는 PostGIS의 `geometry` 타입과 SRID 5186을 사용한다.
