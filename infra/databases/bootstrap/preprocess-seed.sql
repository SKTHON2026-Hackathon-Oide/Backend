\set ON_ERROR_STOP on
\set VERBOSITY terse

\echo '== 1/9 administrative areas =='
\ir ../seeds/administrative_area/administrative_area.sql

\echo '== 2/9 commercial areas =='
\ir ../seeds/commercial_area/commercial-area-staging.sql
\ir ../seeds/commercial_area/commercial-area-transform.sql

\echo '== 3/9 source stores =='
\ir ../seeds/store/store-staging.sql
\ir ../seeds/store/store-transform.sql

\echo '== 4/9 estimated sales =='
\ir ../seeds/sales_statistic/sales-staging.sql
\ir ../seeds/sales_statistic/sales-transform.sql

\echo '== 5/9 commercial store statistics =='
\ir ../seeds/commercial_store_statistics/commercial-store-statistics-staging.sql
\ir ../seeds/commercial_store_statistics/commercial-store-statistics-transform.sql

\echo '== 6/9 buildings =='
\ir ../seeds/building/building-staging-float8.sql
\ir ../seeds/building/building-transform.sql

\echo '== 7/9 land-use zones =='
\ir ../seeds/land_use_zone/land-use-zone-staging.sql
\ir ../seeds/land_use_zone/land-use-zone-transform.sql

\echo '== 8/9 taxonomy and source-store normalization =='
\ir ../seeds/business_category/business-category-seed.sql
\ir ../seeds/business_category/store-category-mapping-seed.sql

\echo '== 9/10 derived spatial links and feature scores =='
\ir ../features/commercial_area_building/commercial-area-building-transform.sql
\ir ../features/area_business_feature/area-business-score-v1.sql
\ir ../validation/feature-preprocessing-validation.sql

\echo '== 10/10 REB vacancy statistics =='
\ir ../seeds/reb_vacancy/reb-vacancy-seed.sql

\echo '== preprocessing seed completed =='
