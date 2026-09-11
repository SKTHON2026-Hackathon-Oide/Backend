# 프론트엔드 추천 결과·선택적 차트 연동 작업 프롬프트

## 작업 목표

기존 추천 API 연동과 요청/SSE 흐름은 유지한 채, 추천 결과의 세부 보고서가 충분한 수치를 보여주면서도 읽기 쉬운 프로덕션 화면으로 보이도록 개선하세요.

백엔드는 기존 응답 필드를 유지하며 각 추천 항목에 선택적인 `charts` 배열을 추가합니다. `charts`가 없거나 빈 배열이어도 기존 화면이 정상적으로 동작해야 합니다.

## 절대 제약

- 추천 요청 API, 상태 조회 API, SSE URL, 인증 헤더, 폴링/스트림 로직을 변경하지 마세요.
- 기존 응답 필드 이름을 변경하거나 제거하지 마세요.
- `charts`가 없다는 이유로 API 재호출이나 별도 차트 API를 추가하지 마세요.
- 차트의 숫자를 프론트에서 계산하거나 추정하지 마세요. API가 전달한 `categories`, `series.values`를 그대로 표시하세요.
- 화면에 `demandScore`, `competitionScore`, `TIME_17_21`, `LOW`, `hackathon-v1` 같은 내부 이름을 새로 노출하지 마세요.
- 현재 상세 보고서 텍스트와 차트가 함께 표시되도록 하되, 차트가 없어도 기존 텍스트 레이아웃을 유지하세요.
- 기존 프로젝트에 차트 라이브러리가 있으면 그것을 우선 사용하세요. 새 라이브러리를 추가할 때는 package manager와 기존 디자인 시스템을 확인한 뒤 최소 변경으로 진행하세요.

## API 타입 추가

기존 추천 항목 타입에 아래 optional 필드를 추가하세요.

```ts
type RecommendationChart = {
  id: string;
  type: 'BAR';
  title: string;
  description: string;
  unit: string;
  categories: string[];
  series: Array<{
    name: string;
    values: Array<number | null>;
  }>;
  statisticsPeriod: {
    from: string | null;
    to: string | null;
  };
};

type Recommendation = {
  // 기존 필드 유지
  rank: number;
  businessCategoryCode: string;
  businessCategoryName: string;
  totalScore: number | null;
  oneLineReason: string;
  evidence: Evidence[];
  risks: string[];
  operatingTips: string[];
  charts?: RecommendationChart[];
};
```

## 차트 컴포넌트

재사용 가능한 `AnalysisChart` 컴포넌트를 하나 만들고, 현재 세부 보고서 컴포넌트에서 다음처럼 선택적으로 렌더링하세요.

```tsx
{recommendation.charts?.map((chart) => (
  <AnalysisChart key={chart.id} chart={chart} />
))}
```

렌더링 규칙:

- 현재 백엔드가 보내는 `type`은 `BAR`입니다.
- `categories[i]`와 각 `series.values[i]`를 같은 인덱스로 연결합니다.
- 값이 `null`이면 0으로 바꾸지 말고 해당 막대의 값을 `-` 또는 “데이터 없음”으로 표시합니다.
- 막대 hover/focus 시 `천 단위 쉼표 + unit`을 표시합니다. 예: `404,617명`, `98.6점`.
- 차트 아래에 `description`을 표시합니다.
- 차트 아래 또는 우측에 `statisticsPeriod.from ~ statisticsPeriod.to`를 표시합니다.
- 기간이 null이면 기간 문구를 표시하지 않습니다.
- 모바일에서는 차트가 화면 밖으로 잘리지 않도록 반응형 너비를 적용합니다.
- 색상은 기존 디자인 시스템의 파란색 계열을 사용하되, 여러 series는 명확하게 구분합니다.
- 접근성을 위해 차트 제목, 단위, 기간, 각 series 이름을 screen reader가 읽을 수 있게 합니다.
- 라이브러리가 접근성 SVG를 지원하지 않으면 시각적 차트와 함께 동일한 데이터를 간단한 표 또는 요약 텍스트로 제공합니다.

## 표시 위치

- 추천 카드 목록에는 기존처럼 `rank`, 업종명, 점수, `oneLineReason`만 보여주세요.
- 사용자가 추천 카드를 열었을 때 세부 보고서 안에서 `evidence`를 먼저 보여주고, 관련 `charts`를 그 다음에 보여주세요.
- 차트가 2개 이상이면 제목과 설명을 기준으로 세로로 배치하세요.
- 차트가 없어도 빈 카드나 빈 영역을 만들지 마세요.
- 전체 추천 결과 비교 차트가 API에서 오면 공통 요약 영역에 배치할 수 있지만, 현재 계약은 추천 항목별 `charts`이므로 우선 각 상세 보고서에만 구현하세요.

## 숫자 표시

- 숫자 원본을 반올림해 새로운 값을 만들지 말고, 가독성을 위한 표시 형식만 적용하세요.
- 정수 인구/점포 수는 `404,617명`, `12개`처럼 표시하세요.
- 점수는 API 값의 정밀도를 존중하되 화면에서는 소수점 첫째 자리까지 표시하세요.
- 단위는 API의 `unit`을 사용하세요. 단위가 비어 있으면 임의로 붙이지 마세요.
- `description`과 차트 값에서 같은 수치를 불필요하게 여러 번 반복하지 마세요.

## 문구 변경

개발자 관점으로 보이는 정적 제목이 있다면 다음처럼 바꾸세요.

- `API 분석 근거` → `상권 분석 근거`
- `리스크와 운영 전략` → `운영 시 고려사항`
- `데이터 한계` → `분석 범위 안내`

다만 백엔드가 내려주는 `evidence.metric`, `evidence.interpretation`, `risks`, `operatingTips`의 내용을 프론트에서 임의로 재작성하지 마세요. 서버 문구를 그대로 보여주되 내부 필드명은 별도 표시하지 않습니다.

## 오류·하위 호환 처리

- `charts`가 undefined, null, 빈 배열인 모든 경우를 안전하게 처리하세요.
- 알 수 없는 `chart.type`은 화면을 깨뜨리지 말고 차트만 건너뛰세요.
- `categories`와 `series.values`의 길이가 다르면 차트를 렌더링하지 않고 기존 텍스트 보고서만 보여주세요.
- API 결과가 부분적으로 로드되는 동안에는 기존 로딩 UI를 사용하세요.
- 차트 렌더링 오류가 추천 결과 전체를 실패시키지 않도록 경계 컴포넌트 또는 안전한 조건부 렌더링을 사용하세요.

## 검증 기준

다음 케이스를 확인하세요.

1. `charts`가 없는 기존 응답: 기존 화면과 동일하게 표시
2. 시간대 차트 1개: `17~21시`, `404,617명`, 통계 기간 표시
3. 연령대 차트 1개: 10대~60대 이상 카테고리와 단위 표시
4. 차트 2개: 세로 간격과 모바일 레이아웃 확인
5. null 값 포함: 0으로 오표시하지 않음
6. 잘못된 categories/values 길이: 텍스트 보고서만 표시
7. 카드 목록에서는 차트를 숨기고 상세 보고서에서만 표시
8. 기존 인증·SSE·추천 요청 동작에 회귀가 없음

작업을 마친 뒤 변경된 파일, 사용한 차트 라이브러리, 테스트 결과를 요약해 주세요. API 요청 코드나 응답 필드의 기존 의미를 바꾸지 않았는지도 함께 확인하세요.
