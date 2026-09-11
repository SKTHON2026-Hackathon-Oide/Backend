export const BUSINESS_LOCATION_SCORE_WEIGHTS = {
  demand: 25,
  supplyOpportunity: 20,
  customerFit: 20,
  timeFit: 15,
  competitionHealth: 10,
  dataConfidence: 10,
} as const;

export interface OperatingHoursInput {
  opensAt: string;
  closesAt: string;
}

export interface ResolvedAdministrativeArea {
  id: string;
  code: string;
  name: string;
  areaType: string;
  parentId: string | null;
  parentCode: string | null;
  parentName: string | null;
  matchMethod: 'CONTAINS' | 'BOUNDARY';
}

export interface BusinessLocationRequestInput {
  requestId: string;
  businessCategoryCode: string;
  businessCategoryName: string;
  longitude: number;
  latitude: number;
  preferredArea: ResolvedAdministrativeArea;
  operatingHours: OperatingHoursInput;
}

export interface BusinessLocationCandidate {
  commercialAreaId: string;
  commercialAreaCode: string;
  commercialAreaName: string;
  commercialAreaType: string | null;
  administrativeAreaCode: string | null;
  administrativeAreaName: string | null;
  longitude: number | null;
  latitude: number | null;
  overlapRatio: number | null;
  distanceMeters: number | null;
  demandScore: number | null;
  competitionScore: number | null;
  storeCount: number | null;
  estimatedSalesAmount: number | null;
  closureRate: number | null;
  population: {
    total: number | null;
    ageGroups: Record<string, number | null>;
    timeBands: Array<{ timeRange: string; population: number | null }>;
  };
  profile: {
    targetAgeGroups: string[];
    peakTimeRanges: string[];
    confidenceLevel: string;
  } | null;
  sourcePeriods: {
    commerce: string | null;
    population: string | null;
    profile: string | null;
  };
  evidenceIds: string[];
}

export interface BusinessLocationEvidencePacket {
  input: BusinessLocationRequestInput;
  candidates: BusinessLocationCandidate[];
  missingData: Array<{ key: string; reason: string }>;
  dataAsOf: {
    commerce: string | null;
    floatingPopulation: string | null;
    profile: string | null;
  };
}

export interface BusinessLocationScoreBreakdown {
  demand: number;
  supplyOpportunity: number;
  customerFit: number;
  timeFit: number;
  competitionHealth: number;
  dataConfidence: number;
}

export interface BusinessLocationRecommendation {
  rank: number;
  commercialAreaId: string;
  commercialAreaCode: string;
  commercialAreaName: string;
  administrativeArea: { code: string | null; name: string | null };
  longitude: number | null;
  latitude: number | null;
  totalScore: number;
  scoreBreakdown: BusinessLocationScoreBreakdown;
  oneLineReason: string;
  evidence: Array<{
    metric: string;
    value: string | number | null;
    unit: string | null;
    interpretation: string;
  }>;
  operatingHourFit: {
    score: number;
    matchedTimeBands: string[];
    explanation: string;
  };
  risks: string[];
  operatingTips: string[];
  evidenceIds: string[];
}

export interface BusinessLocationRecommendationOutput {
  summary: string;
  recommendations: BusinessLocationRecommendation[];
  warnings: string[];
  dataLimitations: string[];
  dataAsOf: BusinessLocationEvidencePacket['dataAsOf'];
}
