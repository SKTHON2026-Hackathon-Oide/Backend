\set ON_ERROR_STOP on
\set VERBOSITY terse

\echo '== 1/11 administrative areas =='
\ir ../seeds/administrative_area/administrative_area.sql

\echo '== 2/11 commercial areas =='
\ir ../seeds/commercial_area/commercial-area-staging.sql
\ir ../seeds/commercial_area/commercial-area-transform.sql

\echo '== 3/11 commercial-area floating population =='
\ir ../seeds/commercial_area_floating_population/commercial-area-floating-population-seed.sql

\echo '== 4/11 source stores =='
\ir ../seeds/store/store-staging.sql
\ir ../seeds/store/store-transform.sql

\echo '== 5/11 estimated sales =='
\ir ../seeds/sales_statistic/sales-staging.sql
\ir ../seeds/sales_statistic/sales-transform.sql

\echo '== 6/11 commercial store statistics =='
\ir ../seeds/commercial_store_statistics/commercial-store-statistics-staging.sql
\ir ../seeds/commercial_store_statistics/commercial-store-statistics-transform.sql

\echo '== 7/11 buildings =='
\ir ../seeds/building/building-staging-float8.sql
\ir ../seeds/building/building-transform.sql

\echo '== 8/11 land-use zones =='
\ir ../seeds/land_use_zone/land-use-zone-staging.sql
\ir ../seeds/land_use_zone/land-use-zone-transform.sql

\echo '== 9/11 taxonomy and source-store normalization =='
\ir ../seeds/business_category/business-category-seed.sql
\ir ../seeds/business_category/business-category-analysis-profile-seed.sql
\ir ../seeds/business_category/store-category-mapping-seed.sql

\echo '== 10/11 derived spatial links and feature scores =='
\ir ../features/commercial_area_building/commercial-area-building-transform.sql
\ir ../features/area_business_feature/area-business-score-v1.sql
\ir ../validation/feature-preprocessing-validation.sql

\echo '== 11/11 REB vacancy statistics =='
\ir ../seeds/reb_vacancy/reb-vacancy-seed.sql

\echo '== preprocessing seed completed =='
