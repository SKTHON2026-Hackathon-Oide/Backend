-- Hackathon v1 business-category heuristics.
--
-- These values are explicit product assumptions, not measured facts. They are
-- intentionally versioned and carry a shared caveat so empirical profiles can
-- replace them without changing the canonical business taxonomy.
BEGIN;

UPDATE public.business_category_analysis_profile
SET is_active = false,
    updated_at = now()
WHERE is_active
  AND profile_version <> 'hackathon-v1';

WITH profiles (
  code,
  target_age_groups,
  peak_time_ranges,
  peak_day_types,
  preferred_floors,
  area_min,
  area_max,
  floating_importance,
  resident_importance,
  worker_importance,
  transit_importance,
  visibility_importance,
  parking_importance,
  delivery_compatibility,
  competition_tolerance,
  rent_sensitivity,
  weekend_dependence,
  evening_dependence,
  rationale
) AS (
  VALUES
    ('CS100001', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 50, 200, 5, 4, 4, 4, 5, 3, 5, 4, 4, 4, 4, '한식은 점심 직장 수요와 저녁·주말 생활권 수요를 함께 보며 가시성과 배달 수요를 중시한다.'),
    ('CS100002', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 40, 160, 5, 4, 4, 4, 5, 2, 5, 4, 4, 4, 4, '중식은 점심 회전과 배달 적합도가 높고 저녁 수요도 있어 혼합 상권에 적합하다고 가정한다.'),
    ('CS100003', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 40, 150, 5, 3, 5, 5, 5, 2, 3, 4, 3, 4, 4, '일식은 직장인 점심과 목적형 저녁 방문 비중을 높게 보고 교통 접근성과 가시성을 중시한다.'),
    ('CS100004', ARRAY['20S','30S','40S'], ARRAY['TIME_11_14','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 50, 200, 5, 3, 4, 5, 5, 2, 3, 4, 3, 5, 4, '양식은 젊은 고객과 주말 목적 방문 비중을 높게 보고 가시성·교통 접근성을 중시한다.'),
    ('CS100005', ARRAY['20S','30S','40S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 25, 100, 5, 5, 3, 4, 5, 2, 3, 3, 5, 4, 2, '제과점은 아침·오후 생활권 반복 구매와 1층 가시성이 중요하고 임대료 민감도가 높다고 가정한다.'),
    ('CS100006', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 35, 140, 5, 4, 4, 5, 5, 3, 5, 5, 4, 5, 4, '패스트푸드는 청년층, 높은 유동, 교통 접근, 배달 수요와 브랜드 집적 효과를 중시한다.'),
    ('CS100007', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 30, 120, 4, 5, 3, 3, 4, 2, 5, 4, 4, 5, 5, '치킨전문점은 주거 인구, 저녁·야간, 주말과 배달 수요의 영향을 크게 받는다고 가정한다.'),
    ('CS100008', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 20, 80, 5, 5, 3, 4, 5, 2, 5, 4, 5, 4, 3, '분식은 학생·생활권 유동과 1층 접근성, 가격 민감 수요와 배달 가능성을 중시한다.'),
    ('CS100009', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW','BASEMENT'], 45, 180, 5, 3, 5, 5, 4, 2, 2, 4, 3, 5, 5, '호프·간이주점은 직장인 저녁·야간 수요와 대중교통 접근성, 상권 집적 효과를 중시한다.'),
    ('CS100010', ARRAY['20S','30S','40S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 25, 130, 5, 4, 5, 5, 5, 2, 3, 5, 4, 4, 2, '커피·음료는 직장·생활 유동, 체류 수요, 교통 접근성과 가시성을 모두 중시하며 경쟁 집적을 비교적 허용한다.'),

    ('CS200001', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY'], ARRAY['LOW','UPPER'], 50, 250, 3, 5, 3, 4, 3, 3, 1, 3, 4, 2, 4, '일반교습학원은 학생·가구가 있는 주거 생활권과 방과 후 접근성을 우선한다.'),
    ('CS200002', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER'], 50, 250, 3, 5, 3, 5, 3, 3, 1, 3, 4, 3, 4, '외국어학원은 학생과 직장인 수강 수요, 대중교통 접근성과 저녁 시간대를 중시한다.'),
    ('CS200003', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER'], 50, 300, 3, 5, 2, 4, 3, 3, 1, 3, 4, 4, 3, '예술학원은 가족 생활권, 방과 후·주말 수요와 수업 공간 확보를 중시한다.'),
    ('CS200004', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER'], 40, 180, 3, 4, 4, 5, 2, 2, 1, 3, 4, 3, 4, '컴퓨터학원은 학생·직장인과 저녁 수요, 역세권 접근성을 중시하고 가시성 의존은 낮다고 가정한다.'),
    ('CS200005', ARRAY['TEENS','20S','30S','40S','50S'], ARRAY['TIME_06_11','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER','BASEMENT'], 80, 500, 4, 5, 4, 4, 3, 4, 1, 4, 3, 4, 4, '스포츠 강습은 넓은 공간, 주거 인구, 출퇴근 전후와 주말 수요를 중시한다.'),
    ('CS200006', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['GROUND','LOW'], 60, 300, 3, 5, 4, 5, 4, 4, 1, 4, 2, 1, 1, '일반의원은 상주·직장 인구, 교통 접근성과 엘리베이터·주차 같은 방문 편의성을 중시한다.'),
    ('CS200007', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 60, 250, 3, 5, 4, 5, 4, 4, 1, 4, 2, 2, 1, '치과의원은 생활권 반복 방문과 접근 편의, 주차를 중시하고 목적 방문을 허용한다.'),
    ('CS200008', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 50, 220, 3, 5, 3, 4, 4, 4, 1, 3, 3, 2, 1, '한의원은 중장년·고령 생활인구와 반복 방문 편의, 저층·주차 접근성을 중시한다.'),
    ('CS200009', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 60, 250, 3, 5, 3, 4, 4, 5, 1, 3, 3, 3, 1, '동물병원은 반려동물 보유 가구가 많은 주거권과 차량·도보 접근성을 중시한다.'),
    ('CS200010', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['LOW','UPPER'], 30, 150, 2, 3, 5, 5, 2, 3, 1, 3, 2, 1, 1, '변호사사무소는 업무지구, 법원·관공서 접근성과 대중교통을 중시하며 가시성 의존은 낮다.'),
    ('CS200011', ARRAY['30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['LOW','UPPER'], 25, 120, 2, 2, 5, 5, 2, 2, 1, 3, 2, 1, 1, '변리사사무소는 기업·연구 업무 수요와 업무지구 접근성을 우선한다.'),
    ('CS200012', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['GROUND','LOW','UPPER'], 20, 100, 2, 4, 4, 5, 3, 2, 1, 3, 3, 1, 1, '법무사사무소는 생활 민원과 부동산·법원 업무 접근성을 함께 고려한다.'),
    ('CS200013', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['LOW','UPPER'], 20, 100, 2, 3, 5, 5, 2, 2, 1, 3, 3, 1, 1, '기타법무서비스는 업무 인구와 관련 기관 접근성이 중요하고 목적 방문 성격이 강하다.'),
    ('CS200014', ARRAY['30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['LOW','UPPER'], 25, 130, 2, 3, 5, 5, 2, 2, 1, 3, 2, 1, 1, '회계사사무소는 기업 고객이 많은 업무지구와 교통 접근성을 우선한다.'),
    ('CS200015', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['GROUND','LOW','UPPER'], 20, 110, 2, 4, 5, 5, 3, 2, 1, 3, 3, 1, 1, '세무사사무소는 자영업자·기업 밀집지역과 생활권 접근성을 함께 고려한다.'),
    ('CS200016', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','BASEMENT'], 70, 250, 4, 4, 3, 4, 3, 3, 1, 4, 4, 5, 5, '당구장은 넓은 실내 공간과 저녁·야간 체류 수요, 비교적 낮은 임대료를 중시한다.'),
    ('CS200017', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER','BASEMENT'], 150, 1000, 3, 4, 5, 4, 2, 5, 1, 4, 2, 4, 3, '골프연습장은 대형 공간과 주차, 중장년·직장인 수요가 핵심이라고 가정한다.'),
    ('CS200018', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_14_17','TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER','BASEMENT'], 300, 1500, 4, 4, 3, 5, 3, 5, 1, 4, 2, 5, 5, '볼링장은 대형 공간, 교통·주차 접근성과 저녁·주말 여가 수요를 중시한다.'),
    ('CS200019', ARRAY['TEENS','20S','30S'], ARRAY['TIME_14_17','TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER','BASEMENT'], 80, 300, 5, 4, 3, 5, 3, 2, 1, 5, 3, 5, 5, 'PC방은 청년 유동, 심야·주말 수요, 교통 접근성과 업종 집적을 중시한다.'),
    ('CS200020', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_14_17','TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 50, 250, 5, 4, 3, 5, 5, 2, 1, 4, 3, 5, 5, '전자게임장은 청년·가족 유동과 가시성, 저녁·주말 여가 수요가 중요하다.'),
    ('CS200021', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_14_17','TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW','BASEMENT'], 50, 400, 5, 4, 3, 5, 4, 3, 1, 4, 3, 5, 5, '기타오락장은 목적형 여가 유동과 주말·저녁 수요, 접근성을 중시한다.'),
    ('CS200022', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 10, 40, 5, 5, 3, 4, 5, 2, 1, 4, 5, 4, 2, '복권방은 소형 1층 점포, 생활권 반복 유동과 높은 가시성이 중요하다.'),
    ('CS200023', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 15, 60, 4, 5, 4, 5, 4, 2, 1, 3, 4, 3, 2, '통신기기수리는 생활권과 업무권의 접근성, 소형 점포와 빠른 방문 편의를 중시한다.'),
    ('CS200024', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_06_11','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER','BASEMENT'], 120, 700, 4, 5, 5, 5, 3, 4, 1, 5, 3, 4, 4, '스포츠클럽은 넓은 공간과 출퇴근 전후 수요, 주거·직장 인구 및 접근성을 중시한다.'),
    ('CS200025', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 100, 700, 2, 4, 3, 2, 3, 5, 1, 3, 3, 2, 1, '자동차수리는 차량 진입, 주차·작업 공간과 도로 접근성이 핵심이며 보행 유동 의존은 낮다.'),
    ('CS200026', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 80, 500, 2, 4, 3, 2, 4, 5, 1, 4, 3, 4, 1, '자동차미용은 차량 접근, 대기·작업 공간, 주차와 주말 수요를 중시한다.'),
    ('CS200027', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 40, 250, 2, 4, 2, 2, 4, 5, 1, 3, 4, 3, 1, '모터사이클수리는 1층 차량 접근과 작업 공간, 관련 고객 생활권을 우선한다.'),
    ('CS200028', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 25, 130, 4, 5, 4, 5, 5, 2, 1, 4, 4, 5, 3, '미용실은 생활권 반복 수요, 교통 접근성, 가시성과 주말·저녁 수요를 중시한다.'),
    ('CS200029', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW','UPPER'], 15, 70, 4, 5, 4, 5, 4, 2, 1, 4, 4, 5, 3, '네일숍은 젊은 여성 생활·직장 수요와 예약 방문, 역세권 및 주말 수요를 중시한다.'),
    ('CS200030', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER'], 25, 120, 3, 5, 4, 5, 3, 3, 1, 4, 3, 5, 3, '피부관리실은 예약 기반 목적 방문과 여성 생활·직장 수요, 접근 편의를 중시한다.'),
    ('CS200031', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 25, 100, 3, 5, 2, 3, 4, 3, 1, 3, 5, 3, 1, '세탁소는 주거 생활권의 반복 수요와 1층 접근성, 낮은 임대 부담을 중시한다.'),
    ('CS200032', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 25, 120, 2, 5, 2, 3, 4, 4, 1, 3, 4, 3, 1, '가전제품수리는 주거 밀집지역, 물품 운반을 위한 차량 접근과 1층 공간이 중요하다.'),
    ('CS200033', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 15, 80, 4, 5, 3, 4, 5, 2, 1, 5, 4, 4, 1, '부동산중개업은 주거·상업 거래가 있는 생활권의 1층 가시성과 접근성을 중시한다.'),
    ('CS200034', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_17_21','TIME_21_24','TIME_00_06'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['ANY'], 150, 1500, 3, 2, 3, 5, 4, 5, 2, 4, 2, 5, 5, '여관은 관광·업무 목적 방문, 교통 접근성과 주차, 야간·주말 수요를 중시한다.'),
    ('CS200035', ARRAY['20S','30S','40S'], ARRAY['TIME_17_21','TIME_21_24','TIME_00_06'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['ANY'], 100, 1000, 4, 2, 2, 5, 4, 3, 2, 4, 3, 5, 5, '게스트하우스는 젊은 관광객, 대중교통과 관광지 접근성, 주말 체류 수요를 중시한다.'),
    ('CS200036', ARRAY['20S','30S','40S'], ARRAY['TIME_17_21','TIME_21_24','TIME_00_06'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['ANY'], 100, 1000, 2, 4, 4, 5, 2, 2, 1, 3, 5, 3, 4, '고시원은 직장·학업 접근성, 장기 거주 수요와 낮은 임대 부담을 중시한다.'),
    ('CS200037', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER','BASEMENT'], 80, 400, 5, 3, 5, 5, 3, 2, 1, 5, 3, 5, 5, '노래방은 유흥·외식 집적지의 저녁·야간 유동, 대중교통 접근성과 경쟁 집적을 중시한다.'),
    ('CS200038', ARRAY['TEENS','20S','30S'], ARRAY['TIME_14_17','TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER'], 60, 300, 3, 5, 3, 5, 2, 2, 1, 4, 4, 4, 4, '독서실은 학생·취업 준비생이 많은 주거권과 교통 접근성, 조용한 중상층 공간을 선호한다.'),
    ('CS200039', ARRAY['20S','30S','40S'], ARRAY['TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','BASEMENT'], 50, 200, 4, 3, 3, 5, 3, 2, 1, 3, 4, 5, 5, 'DVD방은 젊은층의 저녁·주말 목적 방문과 유흥 상권 접근성을 중시한다.'),
    ('CS200040', ARRAY['20S','30S','40S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['LOW','UPPER','BASEMENT'], 40, 200, 2, 2, 4, 4, 2, 2, 1, 3, 4, 3, 3, '녹음실은 목적 방문형으로 방음 가능한 공간과 창작자 접근성, 임대 부담을 중시한다.'),
    ('CS200041', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 25, 150, 4, 4, 4, 5, 5, 2, 1, 4, 3, 5, 3, '사진관은 가시성, 교통 접근성과 졸업·가족·증명사진 등 생활권 목적 수요를 중시한다.'),
    ('CS200042', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['LOW','UPPER'], 15, 80, 1, 2, 5, 4, 1, 1, 1, 2, 3, 1, 1, '통번역서비스는 업무 수요와 접근성을 보되 비대면 제공 가능성이 높아 입지 의존도가 낮다.'),
    ('CS200043', ARRAY['30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['GROUND','LOW'], 40, 250, 1, 3, 5, 3, 2, 5, 1, 3, 5, 1, 1, '건축물청소는 사업자 고객과 장비·차량 보관 공간, 낮은 임대 부담을 중시한다.'),
    ('CS200044', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW','UPPER'], 20, 100, 3, 3, 5, 5, 3, 2, 1, 4, 4, 4, 2, '여행사는 직장인·가족 고객 접근성과 상담 목적 방문, 온라인 경쟁을 함께 고려한다.'),
    ('CS200045', ARRAY['20S','30S','40S'], ARRAY['TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 30, 150, 3, 4, 3, 4, 4, 2, 2, 2, 5, 4, 3, '비디오·서적임대는 생활권 고객과 낮은 임대료가 중요하며 온라인 대체 위험이 크다고 가정한다.'),
    ('CS200046', ARRAY['20S','30S','40S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW','UPPER'], 30, 180, 4, 3, 4, 5, 4, 2, 2, 3, 4, 5, 3, '의류임대는 젊은층·행사 수요와 예약 방문, 교통 접근성과 주말 수요를 중시한다.'),
    ('CS200047', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 50, 300, 2, 5, 3, 3, 3, 5, 3, 3, 4, 4, 1, '가정용품임대는 주거권 수요, 물품 보관 공간과 차량 접근성을 중시한다.'),

    ('CS300001', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 100, 800, 5, 5, 3, 4, 5, 5, 4, 4, 5, 5, 4, '슈퍼마켓은 대규모 주거 수요, 1층 가시성, 주차·배송과 전 시간대 반복 구매를 중시한다.'),
    ('CS300002', ARRAY['TEENS','20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_00_06','TIME_06_11','TIME_11_14','TIME_14_17','TIME_17_21','TIME_21_24'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 40, 150, 5, 5, 5, 5, 5, 2, 4, 5, 5, 5, 5, '편의점은 전 연령·전 시간대 유동, 주거·직장 혼합 수요와 1층 가시성이 핵심이다.'),
    ('CS300003', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 30, 150, 3, 3, 5, 5, 4, 3, 3, 4, 4, 3, 2, '컴퓨터·주변장치 판매는 업무·학생 수요, 교통 접근성과 목적 구매를 중시한다.'),
    ('CS300004', ARRAY['TEENS','20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 15, 70, 5, 4, 5, 5, 5, 2, 2, 5, 4, 4, 3, '핸드폰 판매는 높은 유동과 1층 가시성, 교통 접근성 및 경쟁 매장 집적을 중시한다.'),
    ('CS300005', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['GROUND'], 80, 500, 1, 3, 5, 2, 2, 5, 4, 3, 5, 1, 1, '주류도매는 사업자 수요, 창고 면적과 차량 상하차 접근성, 낮은 임대 부담을 중시한다.'),
    ('CS300006', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 30, 180, 3, 5, 2, 3, 4, 4, 3, 3, 5, 4, 1, '미곡판매는 주거 생활권과 중장년 반복 구매, 적재·배송 편의를 중시한다.'),
    ('CS300007', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 30, 150, 4, 5, 3, 3, 5, 3, 3, 4, 5, 5, 2, '육류판매는 주거 생활권과 저녁·주말 식재료 구매, 1층 가시성을 중시한다.'),
    ('CS300008', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 30, 160, 4, 5, 3, 3, 5, 3, 3, 4, 5, 5, 2, '수산물판매는 생활권 신선식품 수요, 1층 접근성과 주말 구매 수요를 중시한다.'),
    ('CS300009', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 25, 130, 4, 5, 2, 3, 5, 2, 3, 4, 5, 5, 2, '청과상은 주거 인구, 오전·저녁 반복 구매와 1층 가시성이 중요하다.'),
    ('CS300010', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 20, 100, 4, 5, 3, 4, 5, 2, 5, 4, 5, 5, 2, '반찬가게는 주거 생활권, 퇴근 시간대와 배달·포장 수요, 1층 접근성을 중시한다.'),
    ('CS300011', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 40, 250, 5, 3, 4, 5, 5, 3, 2, 5, 3, 5, 3, '일반의류는 유동·가시성, 쇼핑 집적 효과와 주말 수요를 중시한다.'),
    ('CS300012', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 30, 150, 3, 4, 2, 4, 4, 3, 1, 3, 4, 5, 1, '한복점은 혼례·행사 목적 방문과 중장년 고객, 주말 및 차량 접근성을 중시한다.'),
    ('CS300013', ARRAY['20S','30S','40S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 30, 160, 4, 5, 3, 5, 5, 4, 2, 4, 3, 5, 2, '유아의류는 영유아 가구가 많은 생활권과 주말 가족 방문, 주차·교통 편의를 중시한다.'),
    ('CS300014', ARRAY['TEENS','20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 35, 180, 5, 3, 4, 5, 5, 3, 2, 5, 3, 5, 3, '신발 판매는 유동과 쇼핑 집적, 가시성 및 주말 수요를 중시한다.'),
    ('CS300015', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 25, 130, 5, 3, 4, 5, 5, 2, 2, 5, 3, 5, 3, '가방 판매는 쇼핑 유동, 가시성, 교통 접근성과 업종 집적을 중시한다.'),
    ('CS300016', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 20, 100, 4, 5, 4, 5, 5, 3, 1, 4, 3, 4, 2, '안경점은 생활권 반복 수요와 목적 방문, 1층 가시성 및 교통 접근성을 중시한다.'),
    ('CS300017', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 20, 100, 4, 3, 4, 5, 5, 3, 1, 5, 2, 5, 2, '시계·귀금속은 구매력 있는 중장년 고객, 쇼핑 집적과 신뢰 가능한 가시적 입지를 중시한다.'),
    ('CS300018', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 25, 100, 4, 5, 4, 5, 5, 3, 1, 5, 3, 4, 2, '의약품 판매는 생활권·의료시설 인접 수요, 1층 접근성과 전 연령 편의를 중시한다.'),
    ('CS300019', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['GROUND','LOW'], 40, 200, 2, 4, 5, 4, 3, 5, 2, 3, 3, 1, 1, '의료기기 판매는 병원·고령 고객과 사업자 목적 방문, 주차·운반 편의를 중시한다.'),
    ('CS300020', ARRAY['TEENS','20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 60, 400, 4, 4, 4, 5, 5, 2, 3, 4, 4, 5, 3, '서적 판매는 학생·문화 소비층, 교통 접근성과 체류·주말 수요를 중시한다.'),
    ('CS300021', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 20, 100, 4, 5, 4, 4, 5, 2, 2, 4, 5, 4, 2, '문구점은 학교·학원과 가족 생활권, 1층 가시성 및 가격 민감도를 중시한다.'),
    ('CS300022', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 25, 130, 5, 3, 4, 5, 5, 2, 3, 5, 3, 5, 3, '화장품 판매는 젊은 여성 유동, 쇼핑 집적과 가시성, 주말 수요를 중시한다.'),
    ('CS300023', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 30, 150, 3, 4, 5, 4, 4, 3, 3, 4, 4, 3, 1, '미용재료 판매는 미용업 사업자와 생활권 고객, 운반·접근 편의를 중시한다.'),
    ('CS300024', ARRAY['TEENS','20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 50, 300, 4, 4, 4, 5, 4, 5, 3, 5, 3, 5, 3, '운동·경기용품은 여가·운동 인구와 주말 수요, 교통·주차 및 업종 집적을 중시한다.'),
    ('CS300025', ARRAY['TEENS','20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 50, 300, 3, 4, 3, 4, 5, 5, 2, 3, 4, 5, 2, '자전거·운송장비 판매는 1층 차량 접근, 전시·수리 공간과 주말 수요를 중시한다.'),
    ('CS300026', ARRAY['TEENS','20S','30S','40S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 40, 250, 4, 5, 3, 5, 5, 4, 3, 4, 3, 5, 2, '완구 판매는 영유아·아동 가구와 가족 주말 방문, 가시성·주차 편의를 중시한다.'),
    ('CS300027', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['GROUND','LOW'], 60, 400, 2, 3, 5, 3, 3, 5, 3, 3, 5, 2, 1, '섬유제품 판매는 사업자 목적 수요, 재고 공간과 상하차 접근성, 낮은 임대 부담을 중시한다.'),
    ('CS300028', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 25, 150, 5, 5, 3, 4, 5, 3, 3, 4, 4, 5, 2, '화초 판매는 생활·보행 유동, 1층 가시성과 주말 선물·가정 수요를 중시한다.'),
    ('CS300029', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 40, 250, 4, 5, 3, 4, 5, 4, 2, 4, 3, 5, 2, '애완동물 판매는 반려 가구 생활권, 1층 접근성, 주차와 주말 수요를 중시한다.'),
    ('CS300030', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 100, 800, 2, 4, 3, 2, 3, 5, 2, 3, 5, 5, 1, '중고가구 판매는 대형 저임대 공간, 차량·상하차 접근과 주말 목적 방문을 중시한다.'),
    ('CS300031', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 150, 1200, 3, 4, 3, 4, 4, 5, 2, 4, 4, 5, 1, '가구 판매는 넓은 전시 공간, 주차·차량 접근성과 주말 목적 방문을 중시한다.'),
    ('CS300032', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 100, 800, 3, 4, 4, 4, 4, 5, 3, 4, 4, 5, 1, '가전제품 판매는 전시 공간, 주차·배송 편의와 주말 가족 구매 수요를 중시한다.'),
    ('CS300033', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 60, 400, 2, 4, 5, 2, 4, 5, 3, 3, 5, 3, 1, '철물점은 생활·건설 사업자 수요, 1층 상하차 접근과 재고 공간, 낮은 임대료를 중시한다.'),
    ('CS300034', ARRAY['TEENS','20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 40, 250, 3, 4, 3, 5, 4, 4, 2, 3, 4, 5, 2, '악기 판매는 학생·취미 고객의 목적 방문, 교통 접근성과 체험 공간을 중시한다.'),
    ('CS300035', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 50, 300, 2, 5, 4, 3, 4, 5, 3, 3, 4, 4, 1, '인테리어업은 주거 정비 수요와 상담·샘플 공간, 차량 접근성을 중시한다.'),
    ('CS300036', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 50, 300, 3, 4, 4, 4, 5, 4, 2, 3, 4, 4, 1, '조명용품 판매는 전시 가시성, 인테리어·사업자 수요와 차량 접근성을 중시한다.'),
    ('CS300037', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 300, 3000, 1, 3, 3, 2, 4, 5, 1, 4, 2, 5, 1, '중고차판매는 대형 전시 공간과 차량 도로 접근성·주차가 핵심이며 보행 유동 의존은 낮다.'),
    ('CS300038', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 60, 400, 1, 3, 5, 2, 3, 5, 2, 3, 4, 3, 1, '자동차부품 판매는 정비업·차량 고객 접근성, 1층 상하차와 재고 공간을 중시한다.'),
    ('CS300039', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 50, 300, 2, 3, 3, 3, 4, 5, 2, 3, 4, 4, 1, '모터사이클·부품 판매는 1층 차량 접근과 전시·정비 공간, 주말 목적 방문을 중시한다.'),
    ('CS300040', ARRAY['30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['GROUND'], 80, 600, 1, 3, 4, 2, 2, 5, 2, 2, 5, 1, 1, '재생용품 판매는 저임대 창고·작업 공간과 차량 상하차 접근성을 우선한다.'),
    ('CS300041', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND','LOW'], 30, 200, 3, 3, 4, 5, 5, 3, 1, 4, 2, 5, 2, '예술품 판매는 문화 소비층의 목적 방문, 전시 가시성·교통 접근성과 주말 수요를 중시한다.'),
    ('CS300042', ARRAY['20S','30S','40S','50S','60_PLUS'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17','TIME_17_21'], ARRAY['WEEKDAY','WEEKEND'], ARRAY['GROUND'], 500, 5000, 1, 3, 3, 2, 5, 5, 1, 3, 2, 4, 2, '주유소는 간선도로 차량 통행, 진출입과 대형 부지 가시성이 핵심이며 보행 유동 의존은 낮다.'),
    ('CS300043', ARRAY['20S','30S','40S','50S'], ARRAY['TIME_06_11','TIME_11_14','TIME_14_17'], ARRAY['WEEKDAY'], ARRAY['GROUND','LOW','UPPER'], 20, 500, 1, 2, 4, 3, 1, 4, 5, 5, 5, 1, 1, '전자상거래업은 온라인 수요와 배송·보관 운영이 핵심으로 오프라인 유동·가시성 의존도가 낮다.')
)
INSERT INTO public.business_category_analysis_profile (
  business_category_code,
  profile_version,
  profile_source,
  confidence_level,
  target_age_groups,
  peak_time_ranges,
  peak_day_types,
  preferred_floors,
  recommended_area_min_sqm,
  recommended_area_max_sqm,
  floating_population_importance,
  resident_population_importance,
  worker_population_importance,
  transit_access_importance,
  street_visibility_importance,
  parking_importance,
  delivery_compatibility,
  competition_tolerance,
  rent_sensitivity,
  weekend_dependence,
  evening_dependence,
  rationale,
  caveat,
  is_active,
  updated_at
)
SELECT
  code,
  'hackathon-v1',
  'AI_HEURISTIC',
  'LOW',
  target_age_groups,
  peak_time_ranges,
  peak_day_types,
  preferred_floors,
  area_min,
  area_max,
  floating_importance,
  resident_importance,
  worker_importance,
  transit_importance,
  visibility_importance,
  parking_importance,
  delivery_compatibility,
  competition_tolerance,
  rent_sensitivity,
  weekend_dependence,
  evening_dependence,
  rationale,
  '보편적인 업종 특성을 AI로 구조화한 해커톤용 휴리스틱이며 실측·법률·수익 보장 자료가 아니다.',
  true,
  now()
FROM profiles
ON CONFLICT (business_category_code, profile_version) DO UPDATE
SET profile_source = EXCLUDED.profile_source,
    confidence_level = EXCLUDED.confidence_level,
    target_age_groups = EXCLUDED.target_age_groups,
    peak_time_ranges = EXCLUDED.peak_time_ranges,
    peak_day_types = EXCLUDED.peak_day_types,
    preferred_floors = EXCLUDED.preferred_floors,
    recommended_area_min_sqm = EXCLUDED.recommended_area_min_sqm,
    recommended_area_max_sqm = EXCLUDED.recommended_area_max_sqm,
    floating_population_importance = EXCLUDED.floating_population_importance,
    resident_population_importance = EXCLUDED.resident_population_importance,
    worker_population_importance = EXCLUDED.worker_population_importance,
    transit_access_importance = EXCLUDED.transit_access_importance,
    street_visibility_importance = EXCLUDED.street_visibility_importance,
    parking_importance = EXCLUDED.parking_importance,
    delivery_compatibility = EXCLUDED.delivery_compatibility,
    competition_tolerance = EXCLUDED.competition_tolerance,
    rent_sensitivity = EXCLUDED.rent_sensitivity,
    weekend_dependence = EXCLUDED.weekend_dependence,
    evening_dependence = EXCLUDED.evening_dependence,
    rationale = EXCLUDED.rationale,
    caveat = EXCLUDED.caveat,
    is_active = EXCLUDED.is_active,
    updated_at = now();

DO $validation$
DECLARE
  category_count bigint;
  active_profile_count bigint;
  missing_profile_count bigint;
BEGIN
  SELECT count(*) INTO category_count
  FROM public.business_category;

  SELECT count(*) INTO active_profile_count
  FROM public.business_category_analysis_profile
  WHERE is_active;

  SELECT count(*) INTO missing_profile_count
  FROM public.business_category AS category
  LEFT JOIN public.business_category_analysis_profile AS profile
    ON profile.business_category_code = category.code
   AND profile.is_active
  WHERE profile.id IS NULL;

  IF active_profile_count <> category_count OR missing_profile_count > 0 THEN
    RAISE EXCEPTION
      'Expected one active analysis profile per category (categories %, active profiles %, missing %).',
      category_count,
      active_profile_count,
      missing_profile_count;
  END IF;
END;
$validation$;

COMMIT;
