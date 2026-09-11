import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BusinessLocationCandidate,
  BusinessLocationEvidencePacket,
  BusinessLocationRequestInput,
} from '../../domain/business-location-recommendation.types';

type CandidateRow = {
  commercial_area_id: string;
  commercial_area_code: string;
  commercial_area_name: string;
  commercial_area_type: string | null;
  administrative_area_code: string | null;
  administrative_area_name: string | null;
  longitude: string | null;
  latitude: string | null;
  overlap_ratio: string | null;
  distance_meters: string | null;
  demand_score: string | null;
  competition_score: string | null;
  store_count: string | null;
  estimated_sales_amount: string | null;
  closure_rate: string | null;
  commerce_period: string | null;
};
type PopulationRow = {
  commercial_area_id: string;
  source_period: string;
  total_population: string | null;
  age_10s: string | null;
  age_20s: string | null;
  age_30s: string | null;
  age_40s: string | null;
  age_50s: string | null;
  age_60_plus: string | null;
  time_00_06: string | null;
  time_06_11: string | null;
  time_11_14: string | null;
  time_14_17: string | null;
  time_17_21: string | null;
  time_21_24: string | null;
};
type ProfileRow = {
  target_age_groups: string[] | null;
  peak_time_ranges: string[] | null;
  confidence_level: string;
  profile_version: string;
};

const numberOrNull = (value: string | null): number | null => {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const integerOrNull = (value: string | null): number | null => {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed);
};

@Injectable()
export class SqlBusinessLocationEvidenceCollector {
  constructor(private readonly dataSource: DataSource) {}

  async collect(
    input: BusinessLocationRequestInput,
  ): Promise<BusinessLocationEvidencePacket> {
    const rows = await this.dataSource.query<CandidateRow[]>(
      `
      WITH latest AS (
        SELECT DISTINCT ON (commercial_area_id)
          commercial_area_id, demand_score, competition_score, store_count,
          estimated_sales_amount, closure_rate, base_period
        FROM area_business_feature
        WHERE business_category_code = $1
        ORDER BY commercial_area_id, base_period DESC
      )
      SELECT ca.id::text AS commercial_area_id, ca.commercial_area_code,
             ca.commercial_area_name, ca.commercial_area_type,
             aa.code AS administrative_area_code, aa.name AS administrative_area_name,
             ST_X(ST_Transform(ST_Centroid(ca.geom), 4326))::text AS longitude,
             ST_Y(ST_Transform(ST_Centroid(ca.geom), 4326))::text AS latitude,
             (ST_Area(ST_Intersection(ca.geom, aa.geom)) / NULLIF(ST_Area(ca.geom), 0))::text AS overlap_ratio,
             ST_Distance(ca.geom, ST_Transform(ST_SetSRID(ST_Point($2, $3), 4326), 5186))::text AS distance_meters,
             latest.demand_score::text, latest.competition_score::text, latest.store_count::text,
             latest.estimated_sales_amount::text, latest.closure_rate::text,
             latest.base_period::text AS commerce_period
      FROM latest
      JOIN commercial_area ca ON ca.id = latest.commercial_area_id
      JOIN administrative_area aa ON aa.id = $4
      WHERE ST_Intersects(ca.geom, aa.geom)
      ORDER BY latest.demand_score DESC NULLS LAST,
               ST_Area(ST_Intersection(ca.geom, aa.geom)) DESC, ca.id
      LIMIT 20
    `,
      [
        input.businessCategoryCode,
        input.longitude,
        input.latitude,
        input.preferredArea.id,
      ],
    );

    const ids = rows.map((row) => row.commercial_area_id);
    const populations = ids.length
      ? await this.dataSource.query<PopulationRow[]>(
          `
      SELECT DISTINCT ON (commercial_area_id)
        commercial_area_id::text, base_period::text AS source_period, total_population::text,
        age_10s::text, age_20s::text, age_30s::text, age_40s::text, age_50s::text,
        age_60_plus::text, time_00_06::text, time_06_11::text, time_11_14::text,
        time_14_17::text, time_17_21::text, time_21_24::text
      FROM commercial_area_floating_population_statistic
      WHERE commercial_area_id = ANY($1::bigint[])
      ORDER BY commercial_area_id, base_period DESC
    `,
          [ids],
        )
      : [];
    const [profile] = await this.dataSource.query<ProfileRow[]>(
      `
      SELECT target_age_groups, peak_time_ranges, confidence_level, profile_version
      FROM business_category_analysis_profile
      WHERE business_category_code = $1 AND is_active = true
      ORDER BY profile_version DESC LIMIT 1
    `,
      [input.businessCategoryCode],
    );
    const populationById = new Map(
      populations.map((row) => [row.commercial_area_id, row]),
    );
    const candidates: BusinessLocationCandidate[] = rows.map((row) => {
      const population = populationById.get(row.commercial_area_id);
      const ageGroups: Record<string, number | null> = population
        ? {
            TEENS: integerOrNull(population.age_10s),
            '20S': integerOrNull(population.age_20s),
            '30S': integerOrNull(population.age_30s),
            '40S': integerOrNull(population.age_40s),
            '50S': integerOrNull(population.age_50s),
            '60_PLUS': integerOrNull(population.age_60_plus),
          }
        : {};
      const timeBandRows: Array<[string, string | null]> = population
        ? [
            ['00:00-06:00', population.time_00_06],
            ['06:00-11:00', population.time_06_11],
            ['11:00-14:00', population.time_11_14],
            ['14:00-17:00', population.time_14_17],
            ['17:00-21:00', population.time_17_21],
            ['21:00-24:00', population.time_21_24],
          ]
        : [];
      const timeBands = population
        ? timeBandRows.map(([timeRange, value]) => ({
            timeRange,
            population: integerOrNull(value),
          }))
        : [];
      const profileValue = profile
        ? {
            targetAgeGroups: profile.target_age_groups ?? [],
            peakTimeRanges: profile.peak_time_ranges ?? [],
            confidenceLevel: profile.confidence_level,
          }
        : null;
      return {
        commercialAreaId: row.commercial_area_id,
        commercialAreaCode: row.commercial_area_code,
        commercialAreaName: row.commercial_area_name,
        commercialAreaType: row.commercial_area_type,
        administrativeAreaCode: row.administrative_area_code,
        administrativeAreaName: row.administrative_area_name,
        longitude: numberOrNull(row.longitude),
        latitude: numberOrNull(row.latitude),
        overlapRatio: numberOrNull(row.overlap_ratio),
        distanceMeters: numberOrNull(row.distance_meters),
        demandScore: numberOrNull(row.demand_score),
        competitionScore: numberOrNull(row.competition_score),
        storeCount: integerOrNull(row.store_count),
        estimatedSalesAmount: numberOrNull(row.estimated_sales_amount),
        closureRate: numberOrNull(row.closure_rate),
        population: {
          total: population ? integerOrNull(population.total_population) : null,
          ageGroups,
          timeBands,
        },
        profile: profileValue,
        sourcePeriods: {
          commerce: row.commerce_period,
          population: population?.source_period ?? null,
          profile: profile?.profile_version ?? null,
        },
        evidenceIds: [
          `ev_${input.requestId}_area_${row.commercial_area_id}`,
          `ev_${input.requestId}_population_${row.commercial_area_id}`,
          ...(profile ? [`ev_${input.requestId}_profile`] : []),
        ],
      };
    });
    const missingData = [
      ...(candidates.some((candidate) => candidate.population.total === null)
        ? [
            {
              key: 'floatingPopulation',
              reason: '일부 추천 상권의 유동인구 통계가 없습니다.',
            },
          ]
        : []),
      ...(!profile
        ? [
            {
              key: 'businessProfile',
              reason:
                '선택 업종의 분석 프로파일이 없어 고객층·시간대 적합도를 보수적으로 평가합니다.',
            },
          ]
        : []),
    ];
    if (!candidates.length)
      missingData.push({
        key: 'candidates',
        reason: '선택 행정구역에서 선택 업종의 상권 통계를 찾지 못했습니다.',
      });
    return {
      input,
      candidates,
      missingData,
      dataAsOf: {
        commerce:
          candidates.find((candidate) => candidate.sourcePeriods.commerce)
            ?.sourcePeriods.commerce ?? null,
        floatingPopulation:
          candidates.find((candidate) => candidate.sourcePeriods.population)
            ?.sourcePeriods.population ?? null,
        profile: profile?.profile_version ?? null,
      },
    };
  }
}
