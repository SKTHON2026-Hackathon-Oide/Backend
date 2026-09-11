export const RECOMMENDATION_PROMPT_VERSION = 'location-business-agent-v3';
export const RECOMMENDATION_METHODOLOGY_VERSION = 'location-business-score-v1';
export const RECOMMENDATION_PROFILE_VERSION = 'hackathon-v1';

export const SCORE_WEIGHTS = {
  demand: 25,
  supplyOpportunity: 20,
  customerFit: 20,
  timeFit: 15,
  competitionHealth: 10,
  dataConfidence: 10,
} as const;

export type RecommendationStatus =
  | 'QUEUED'
  | 'RESOLVING_LOCATION'
  | 'COLLECTING_EVIDENCE'
  | 'SCORING_WITH_AI'
  | 'VALIDATING_RESULT'
  | 'COMPLETED'
  | 'FAILED';

export type RecommendationStage =
  | 'QUEUED'
  | 'RESOLVING_LOCATION'
  | 'COLLECTING_EVIDENCE'
  | 'SCORING_WITH_AI'
  | 'VALIDATING_RESULT';

export type EvidenceQuality = 'MEASURED' | 'DERIVED' | 'PROXY';

export interface BuildingEvidence {
  buildingId: string;
  address: string | null;
  buildingName: string | null;
  longitude: number | null;
  latitude: number | null;
  commercialAreas: Array<{
    id: string;
    code: string;
    name: string;
    type: string | null;
    overlapRatio: number | null;
    distanceMeters: number | null;
    relation: 'DIRECT' | 'SPATIAL_FALLBACK';
  }>;
  evidenceId: string;
}

export interface CommerceCandidateEvidence {
  code: string;
  name: string;
  storeCount: number | null;
  nearbyStoreCount: number | null;
  estimatedSalesAmount: number | null;
  closureRate: number | null;
  competitionScore: number | null;
  demandScore: number | null;
  areaCount: number;
  evidenceId: string;
}

export interface CommerceEvidence {
  radiusMeters: number[];
  candidates: CommerceCandidateEvidence[];
  totalStoreCount: number;
  sourcePeriod: string | null;
  evidenceId: string;
}

export interface PopulationBand {
  timeRange: string;
  population: number | null;
}

export interface PopulationEvidence {
  totalPopulation: number | null;
  malePopulation: number | null;
  femalePopulation: number | null;
  ageGroups: Record<string, number | null>;
  dayOfWeek: Record<string, number | null>;
  timeBands: PopulationBand[];
  sourcePeriod: string | null;
  evidenceId: string;
}

export interface BusinessProfileEvidence {
  code: string;
  targetAgeGroups: string[];
  peakTimeRanges: string[];
  peakDayTypes: string[];
  floatingPopulationImportance: number;
  residentPopulationImportance: number;
  workerPopulationImportance: number;
  deliveryCompatibility: number;
  competitionTolerance: number;
  weekendDependence: number;
  eveningDependence: number;
  confidenceLevel: string;
  evidenceId: string;
}

export interface RecommendationEvidencePacket {
  building: BuildingEvidence;
  commerce: CommerceEvidence;
  population: PopulationEvidence;
  profiles: BusinessProfileEvidence[];
  missingData: Array<{ key: string; reason: string }>;
  dataAsOf: Record<string, string | null>;
}

export interface ScoreBreakdown {
  demand: number;
  supplyOpportunity: number;
  customerFit: number;
  timeFit: number;
  competitionHealth: number;
  dataConfidence: number;
}

export type RecommendationChartSelectionType =
  | 'POPULATION_BY_TIME'
  | 'POPULATION_BY_AGE'
  | 'POPULATION_BY_DAY'
  | 'BUSINESS_COMPARISON';

export interface RecommendationChartSelection {
  type: RecommendationChartSelectionType;
  reason: string;
}

export interface RecommendationChartSeries {
  name: string;
  values: Array<number | null>;
}

export interface RecommendationChart {
  id: string;
  type: 'BAR';
  title: string;
  description: string;
  unit: string;
  categories: string[];
  series: RecommendationChartSeries[];
  statisticsPeriod: {
    from: string | null;
    to: string | null;
  };
}

export interface AgentRecommendation {
  rank: number;
  businessCategoryCode: string;
  businessCategoryName: string;
  totalScore: number | null;
  confidence: number;
  oneLineReason: string;
  evidence: RecommendationEvidence[];
  risks: string[];
  operatingTips: string[];
  chartSelections?: RecommendationChartSelection[];
  charts?: RecommendationChart[];
}

export type RecommendationEvidenceType =
  'BUILDING' | 'DEMAND' | 'COMPETITION' | 'POPULATION' | 'PROFILE' | 'RISK';

export interface RecommendationEvidence {
  type: RecommendationEvidenceType;
  metric: string;
  value: string | number | Record<string, unknown> | null;
  unit: string | null;
  statisticsPeriod: {
    from: string | null;
    to: string | null;
  };
  interpretation: string;
}

export interface SelectedCommercialArea {
  code: string | null;
  name: string | null;
  matchMethod: 'OVERLAP' | 'NEAREST' | null;
  overlapRatio: number | null;
  distanceMeters: number | null;
}

export interface RecommendationAgentOutput {
  summary: string;
  selectedCommercialArea: SelectedCommercialArea;
  recommendations: AgentRecommendation[];
  warnings: string[];
  dataLimitations: string[];
}
