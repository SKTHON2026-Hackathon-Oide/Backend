# 전처리 파이프라인 작업 내역

작성일: 2026-09-11

## 목표

서울시 상권·점포·매출 통계, 건축물, 행정구역, 용도지역 데이터를 빈 PostGIS
데이터베이스에서 애플리케이션용 전처리 데이터베이스까지 재현 가능하게 적재한다.

추천 API, 자연어 조건 해석, 최종 가중치 점수는 이 작업 범위에 포함하지 않는다.

## 현재 적재 데이터 기준

| 테이블 | 기준 건수 |
| --- | ---: |
| `administrative_area` | 492 |
| `building` | 695,754 |
| `commercial_area` | 1,650 |
| `store` | 554,092 |
| `sales_statistic` | 85,732 |
| `area_business_feature` | 304,775 |
| `land_use_zone` | 17 |
| `commercial_area_building` | 0 (작업 전) |

`commercial_area_feature`는 유동인구·임대료 데이터를 MVP에서 제외했으므로 빈 상태를
정상으로 간주한다. 누락 데이터를 0으로 만들어 채우지 않는다.

## 실행 결과

2026-09-11 현재 개발 DB와 별도 빈 테스트 DB에서 동일한 부트스트랩을 실행했고,
최종 검증을 통과했다.

| 결과 | 건수 |
| --- | ---: |
| `business_category` | 100 |
| `store_category_mapping` | 247 |
| 정규화된 상가 | 96,001 |
| `commercial_area_building` 연결 | 440,714 |
| 경쟁도 계산 | 304,775 |
| 수요도 계산 | 84,696 |

공간 연결의 고아 참조와 점수 범위 오류는 0건이며, `stg_*` 테이블도 남아 있지
않다. TypeORM 마이그레이션 8개가 모두 적용되었고 `npm run build`와 변경 파일
대상 lint도 통과했다.

## 변경 내역

### 1. 업종 코드 정규화

- 서울시 상권분석 서비스의 `CS*` 코드를 표준 코드로 사용하는
  `business_category` 테이블을 추가했다.
- 2025년 점포 통계에서 사용된 100개 CS 코드와 업종명을 시드한다.
- 원본 소상공인 분류를 변경하지 않고 `store.service_business_category_code`를
  별도 컬럼으로 추가했다.
- `store_category_mapping`에 소분류 코드별 매핑 상태를 기록한다.
- 현재 자동 확정하는 매핑은 명확한 중분류인 한식(`I201*`), 중식(`I202*`),
  주점(`I211*`), 비알코올 음료(`I212*`)이다. 나머지는 `REVIEW`/`NULL`로 남겨
  잘못된 추정을 방지한다.

관련 파일:

- `src/database/migrations/0000000000005-create-business-category-schema.ts`
- `src/modules/commercial-areas/infrastructure/persistence/typeorm/entities/business-category.entity.ts`
- `src/modules/stores/infrastructure/persistence/typeorm/entities/store-category-mapping.entity.ts`
- `infra/databases/seeds/business_category/business-category-seed.sql`
- `infra/databases/seeds/business_category/store-category-mapping-seed.sql`

새 엔티티는 각 모듈의 `TypeOrmModule.forFeature`에 등록했고, 애플리케이션의
`synchronize`는 `false`로 고정했다. 스키마 변경은 migration으로만 적용한다.

### 2. 건축물-상권 연결 기준 수정

기존 `commercial_area_building`은 데이터가 없는 레거시 `gis_building`을 참조하고
있었다. 실제 데이터가 있는 `building`을 참조하도록 `gis_building_id`를
`building_id`로 교체했다.

현재 연결 테이블이 비어 있을 때만 마이그레이션이 진행되며, 이미 파생 링크가 있는
환경에서는 데이터 유실 방지를 위해 중단된다.

관련 파일:

- `src/database/migrations/0000000000006-fix-commercial-area-building-reference.ts`
- `src/modules/commercial-areas/infrastructure/persistence/typeorm/entities/commercial-area-building.entity.ts`

### 3. 건축물-상권 공간 조인

같은 EPSG:5186 Geometry끼리 Bounding Box와 `ST_Intersects`로 후보를 좁힌 뒤,
실제 교집합 면적을 계산한다.

```text
overlap_ratio = ST_Area(ST_Intersection(building, area))
                 / ST_Area(building)
```

경계선만 닿아 교집합 면적이 0인 관계는 저장하지 않는다. 건축물이 상권 여러 개에
걸쳐 있으면 각 관계를 모두 저장한다.

관련 파일:

- `infra/databases/features/commercial_area_building/commercial-area-building-transform.sql`
- `infra/databases/features/commercial_area_building/commercial-area-building-validation.sql`

### 4. 경쟁도·수요도 계산

- `competition_score`: 같은 분기·같은 CS 업종 안에서 `store_count`의 백분위,
  0~100. 높을수록 경쟁 점포가 많다.
- `demand_score`: 같은 분기·같은 CS 업종 안에서
  `estimated_sales_amount / store_count`의 백분위, 0~100. 높을수록 점포당
  추정매출이 높다.
- 점포 수가 0이거나 매출이 없는 행의 수요 점수는 `NULL`로 유지한다.
- 재실행 시 기존 파생 점수를 먼저 초기화하므로 이전 데이터의 점수가 남지 않는다.

관련 파일:

- `src/database/migrations/0000000000007-add-feature-calculation-indexes.ts`
- `infra/databases/features/area_business_feature/area-business-score-v1.sql`
- `infra/databases/features/area_business_feature/area-business-score-validation.sql`

## 빈 DB 일괄 실행

### 권장 실행

`backend/.env`에 DB 접속 정보를 설정한 뒤 다음 명령 하나로 실행한다.

```bash
cd /Users/hoshi/Desktop/skthon/backend
./infra/databases/bootstrap/bootstrap-preprocessed.sh
```

스크립트는 다음 순서로 동작한다.

1. TypeORM 마이그레이션 실행
2. 행정구역 적재
3. 상권 영역 적재
4. 원본 상가 적재
5. 추정매출 적재
6. 상권별 점포 통계 적재 및 매출 점포 수 보완
7. 건축물 적재
8. 용도지역 적재
9. 업종 사전·원본 업종 매핑 적재
10. 건축물-상권 공간 조인
11. 경쟁도·수요도 계산
12. 최종 검증

실제 SQL 파일만 실행하고 싶다면 먼저 `npm run migration:run`을 실행한 후 다음
파일을 `psql`로 호출한다.

```bash
psql -h "$DB_HOST" -U "$DB_USERNAME" -d "$DB_DATABASE" \
  -f infra/databases/bootstrap/preprocess-seed.sql
```

`preprocess-seed.sql`은 `psql`의 `\ir` 명령으로 기존 대용량 원천 staging SQL을
재사용한다. 따라서 DataGrip의 단일 SQL 에디터보다 `psql` 또는 DataGrip의 파일
실행 기능을 권장한다.

호스트에 `psql`이 없으면 스크립트가 `skthon-postgis` 컨테이너의 `psql`을 사용한다.
이 경로를 사용하려면 `docker-compose.yml`의 저장소 마운트가 적용되도록 컨테이너를
재생성해야 한다.

## 완료 검증

읽기 전용 검증은 다음 파일을 사용한다.

```text
infra/databases/validation/preprocessing-baseline.sql
infra/databases/validation/feature-preprocessing-validation.sql
```

최종 검증에서 다음 조건을 만족해야 한다.

- 모든 CS 업종 코드가 `business_category`에 존재
- `commercial_area_building`에 고아 참조 없음
- 모든 중첩 비율이 0~1
- 모든 점수가 0~100
- 건축물·상권·용도지역 Geometry가 유효하고 SRID가 5186
- `stg_*` 테이블이 남아 있지 않음
- 점수 계산 가능 행에 점수가 존재

## 재실행 주의사항

- 원천 staging/transform 파일은 대량 데이터이므로 실행 시간이 길다.
- 공간 조인 파일은 파생 테이블을 `TRUNCATE` 후 다시 생성한다. 운영 중인 DB에서
  실행하지 말고, 배포 전 별도 작업 창에서 실행한다.
- 초기 DB가 아닌 기존 DB에서 `0000000000006`을 적용할 때
  `commercial_area_building`에 이미 데이터가 있으면 먼저 백업·검토한다.
- `gis_building`은 현재 사용하지 않는 레거시 테이블로 유지한다.
- 유동인구와 임대료 데이터를 추가하지 않았으므로 `commercial_area_feature`는
  당분간 비워 둔다.
