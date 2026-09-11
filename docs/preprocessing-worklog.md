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
| `commercial_area_floating_population_statistic` | 9,892 |
| `area_business_feature` | 304,775 |
| `land_use_zone` | 17 |
| `commercial_area_building` | 0 (작업 전) |

`commercial_area_feature`는 유동인구·임대료의 가공 피처 테이블이므로 빈 상태를
정상으로 간주한다. 원천 유동인구는
`commercial_area_floating_population_statistic`에 분기별로 보관한다.

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
않다. TypeORM 마이그레이션 10개가 모두 적용되었고 `npm run build`와 변경 파일
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

### 5. 상권별 유동인구 원천 시드

- 서울 열린데이터광장 `VwsmTrdarFlpopQq` API에서 2025년 1분기부터 2026년
  2분기까지 내려받은 9,892건을 상권 코드로 `commercial_area`에 연결한다.
- 상권·분기마다 성별, 연령대, 시간대, 요일별 유동인구를 보관한다.
- 빈 DB 부트스트랩은 API 키 없이도 재현되도록 SQL 시드를 사용한다. 최신 분기를
  추가할 때는 `npm run import:floating-population` 실행 후 시드와 전체 덤프를 함께
  갱신한다.

관련 파일:

- `src/database/migrations/0000000000009-create-commercial-area-floating-population.ts`
- `infra/databases/seeds/commercial_area_floating_population/commercial-area-floating-population-seed.sql`
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
4. 상권별 유동인구 시드 적재
5. 원본 상가 적재
6. 추정매출 적재
7. 상권별 점포 통계 적재 및 매출 점포 수 보완
8. 건축물 적재
9. 용도지역 적재
10. 업종 사전·원본 업종 매핑 적재
11. 건축물-상권 공간 조인
12. 경쟁도·수요도 계산
13. 최종 검증
14. REB 공실률 통계 적재

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
- `commercial_area_feature`는 가공 피처 테이블이므로 원천 유동인구를 직접
  복제하지 않는다.
