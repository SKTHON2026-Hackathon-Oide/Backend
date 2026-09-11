-- Canonical Seoul commercial-analysis service taxonomy (CS*).
-- Run after the source datasets have been transformed into their application
-- tables. The 2025 store-statistics file contains 100 distinct CS codes.
BEGIN;

INSERT INTO public.business_category (
  code,
  name,
  category_group,
  is_sales_supported,
  updated_at
)
VALUES
  ('CS100001', '한식음식점', 'FOOD', false, now()),
  ('CS100002', '중식음식점', 'FOOD', false, now()),
  ('CS100003', '일식음식점', 'FOOD', false, now()),
  ('CS100004', '양식음식점', 'FOOD', false, now()),
  ('CS100005', '제과점', 'FOOD', false, now()),
  ('CS100006', '패스트푸드점', 'FOOD', false, now()),
  ('CS100007', '치킨전문점', 'FOOD', false, now()),
  ('CS100008', '분식전문점', 'FOOD', false, now()),
  ('CS100009', '호프-간이주점', 'FOOD', false, now()),
  ('CS100010', '커피-음료', 'FOOD', false, now()),
  ('CS200001', '일반교습학원', 'SERVICE', false, now()),
  ('CS200002', '외국어학원', 'SERVICE', false, now()),
  ('CS200003', '예술학원', 'SERVICE', false, now()),
  ('CS200004', '컴퓨터학원', 'SERVICE', false, now()),
  ('CS200005', '스포츠 강습', 'SERVICE', false, now()),
  ('CS200006', '일반의원', 'SERVICE', false, now()),
  ('CS200007', '치과의원', 'SERVICE', false, now()),
  ('CS200008', '한의원', 'SERVICE', false, now()),
  ('CS200009', '동물병원', 'SERVICE', false, now()),
  ('CS200010', '변호사사무소', 'SERVICE', false, now()),
  ('CS200011', '변리사사무소', 'SERVICE', false, now()),
  ('CS200012', '법무사사무소', 'SERVICE', false, now()),
  ('CS200013', '기타법무서비스', 'SERVICE', false, now()),
  ('CS200014', '회계사사무소', 'SERVICE', false, now()),
  ('CS200015', '세무사사무소', 'SERVICE', false, now()),
  ('CS200016', '당구장', 'SERVICE', false, now()),
  ('CS200017', '골프연습장', 'SERVICE', false, now()),
  ('CS200018', '볼링장', 'SERVICE', false, now()),
  ('CS200019', 'PC방', 'SERVICE', false, now()),
  ('CS200020', '전자게임장', 'SERVICE', false, now()),
  ('CS200021', '기타오락장', 'SERVICE', false, now()),
  ('CS200022', '복권방', 'SERVICE', false, now()),
  ('CS200023', '통신기기수리', 'SERVICE', false, now()),
  ('CS200024', '스포츠클럽', 'SERVICE', false, now()),
  ('CS200025', '자동차수리', 'SERVICE', false, now()),
  ('CS200026', '자동차미용', 'SERVICE', false, now()),
  ('CS200027', '모터사이클수리', 'SERVICE', false, now()),
  ('CS200028', '미용실', 'SERVICE', false, now()),
  ('CS200029', '네일숍', 'SERVICE', false, now()),
  ('CS200030', '피부관리실', 'SERVICE', false, now()),
  ('CS200031', '세탁소', 'SERVICE', false, now()),
  ('CS200032', '가전제품수리', 'SERVICE', false, now()),
  ('CS200033', '부동산중개업', 'SERVICE', false, now()),
  ('CS200034', '여관', 'SERVICE', false, now()),
  ('CS200035', '게스트하우스', 'SERVICE', false, now()),
  ('CS200036', '고시원', 'SERVICE', false, now()),
  ('CS200037', '노래방', 'SERVICE', false, now()),
  ('CS200038', '독서실', 'SERVICE', false, now()),
  ('CS200039', 'DVD방', 'SERVICE', false, now()),
  ('CS200040', '녹음실', 'SERVICE', false, now()),
  ('CS200041', '사진관', 'SERVICE', false, now()),
  ('CS200042', '통번역서비스', 'SERVICE', false, now()),
  ('CS200043', '건축물청소', 'SERVICE', false, now()),
  ('CS200044', '여행사', 'SERVICE', false, now()),
  ('CS200045', '비디오/서적임대', 'SERVICE', false, now()),
  ('CS200046', '의류임대', 'SERVICE', false, now()),
  ('CS200047', '가정용품임대', 'SERVICE', false, now()),
  ('CS300001', '슈퍼마켓', 'RETAIL', false, now()),
  ('CS300002', '편의점', 'RETAIL', false, now()),
  ('CS300003', '컴퓨터및주변장치판매', 'RETAIL', false, now()),
  ('CS300004', '핸드폰', 'RETAIL', false, now()),
  ('CS300005', '주류도매', 'RETAIL', false, now()),
  ('CS300006', '미곡판매', 'RETAIL', false, now()),
  ('CS300007', '육류판매', 'RETAIL', false, now()),
  ('CS300008', '수산물판매', 'RETAIL', false, now()),
  ('CS300009', '청과상', 'RETAIL', false, now()),
  ('CS300010', '반찬가게', 'RETAIL', false, now()),
  ('CS300011', '일반의류', 'RETAIL', false, now()),
  ('CS300012', '한복점', 'RETAIL', false, now()),
  ('CS300013', '유아의류', 'RETAIL', false, now()),
  ('CS300014', '신발', 'RETAIL', false, now()),
  ('CS300015', '가방', 'RETAIL', false, now()),
  ('CS300016', '안경', 'RETAIL', false, now()),
  ('CS300017', '시계및귀금속', 'RETAIL', false, now()),
  ('CS300018', '의약품', 'RETAIL', false, now()),
  ('CS300019', '의료기기', 'RETAIL', false, now()),
  ('CS300020', '서적', 'RETAIL', false, now()),
  ('CS300021', '문구', 'RETAIL', false, now()),
  ('CS300022', '화장품', 'RETAIL', false, now()),
  ('CS300023', '미용재료', 'RETAIL', false, now()),
  ('CS300024', '운동/경기용품', 'RETAIL', false, now()),
  ('CS300025', '자전거 및 기타운송장비', 'RETAIL', false, now()),
  ('CS300026', '완구', 'RETAIL', false, now()),
  ('CS300027', '섬유제품', 'RETAIL', false, now()),
  ('CS300028', '화초', 'RETAIL', false, now()),
  ('CS300029', '애완동물', 'RETAIL', false, now()),
  ('CS300030', '중고가구', 'RETAIL', false, now()),
  ('CS300031', '가구', 'RETAIL', false, now()),
  ('CS300032', '가전제품', 'RETAIL', false, now()),
  ('CS300033', '철물점', 'RETAIL', false, now()),
  ('CS300034', '악기', 'RETAIL', false, now()),
  ('CS300035', '인테리어', 'RETAIL', false, now()),
  ('CS300036', '조명용품', 'RETAIL', false, now()),
  ('CS300037', '중고차판매', 'RETAIL', false, now()),
  ('CS300038', '자동차부품', 'RETAIL', false, now()),
  ('CS300039', '모터사이클및부품', 'RETAIL', false, now()),
  ('CS300040', '재생용품 판매점', 'RETAIL', false, now()),
  ('CS300041', '예술품', 'RETAIL', false, now()),
  ('CS300042', '주유소', 'RETAIL', false, now()),
  ('CS300043', '전자상거래업', 'RETAIL', false, now())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    category_group = EXCLUDED.category_group,
    updated_at = now();

UPDATE public.business_category AS category
SET is_sales_supported = EXISTS (
      SELECT 1
      FROM public.sales_statistic AS sales
      WHERE sales.business_category_code = category.code
    ),
    updated_at = now();

DO $validation$
DECLARE
  category_count bigint;
  unknown_feature_count bigint;
  unknown_sales_count bigint;
BEGIN
  SELECT count(*) INTO category_count
  FROM public.business_category
  WHERE code LIKE 'CS%';

  IF category_count < 100 THEN
    RAISE EXCEPTION 'Expected at least 100 canonical CS categories, found %.', category_count;
  END IF;

  SELECT count(*) INTO unknown_feature_count
  FROM (
    SELECT DISTINCT business_category_code FROM public.area_business_feature
    EXCEPT
    SELECT code FROM public.business_category
  ) AS missing;

  SELECT count(*) INTO unknown_sales_count
  FROM (
    SELECT DISTINCT business_category_code FROM public.sales_statistic
    EXCEPT
    SELECT code FROM public.business_category
  ) AS missing;

  IF unknown_feature_count > 0 OR unknown_sales_count > 0 THEN
    RAISE EXCEPTION
      'Unregistered business codes found (feature %, sales %).',
      unknown_feature_count, unknown_sales_count;
  END IF;
END;
$validation$;

COMMIT;
