import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BusinessProfileEvidence,
  BuildingEvidence,
  CommerceCandidateEvidence,
  CommerceEvidence,
  PopulationEvidence,
  RecommendationEvidencePacket,
} from '../../domain/recommendation.types';

type BuildingRow = {
  id: string;
  address: string | null;
  building_name: string | null;
  longitude: string | null;
  latitude: string | null;
};

type CommercialAreaRow = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  overlap_ratio: string | null;
  distance_meters: string | null;
  relation: 'DIRECT' | 'SPATIAL_FALLBACK';
};

type CommerceRow = {
  code: string;
  name: string;
  store_count: string | null;
  nearby_store_count: string | null;
  estimated_sales_amount: string | null;
  closure_rate: string | null;
  competition_score: string | null;
  demand_score: string | null;
  area_count: string;
  source_period: string | null;
};

type PopulationRow = {
  source_period: string | null;
  total_population: string | null;
  male_population: string | null;
  female_population: string | null;
  age_10s: string | null;
  age_20s: string | null;
  age_30s: string | null;
  age_40s: string | null;
  age_50s: string | null;
  age_60_plus: string | null;
  monday_population: string | null;
  tuesday_population: string | null;
  wednesday_population: string | null;
  thursday_population: string | null;
  friday_population: string | null;
  saturday_population: string | null;
  sunday_population: string | null;
  time_00_06: string | null;
  time_06_11: string | null;
  time_11_14: string | null;
  time_14_17: string | null;
  time_17_21: string | null;
  time_21_24: string | null;
};

type ProfileRow = {
  code: string;
  target_age_groups: unknown;
  peak_time_ranges: unknown;
  peak_day_types: unknown;
  floating_population_importance: number;
  resident_population_importance: number;
  worker_population_importance: number;
  delivery_compatibility: number;
  competition_tolerance: number;
  weekend_dependence: number;
  evening_dependence: number;
  confidence_level: string;
};

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toInteger = (
  value: string | number | null | undefined,
): number | null => {
  const number = toNumber(value);
  return number === null ? null : Math.round(number);
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return Array.isArray(parsed)
        ? parsed.filter(
            (item): item is string => typeof item === 'string',
          )
        : [];
    } catch {
      return [];
    }
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"'))
      .filter(Boolean);
  }
  return [trimmed];
};

@Injectable()
export class SqlRecommendationEvidenceCollector {
  constructor(private readonly dataSource: DataSource) {}

  async collect(
    requestId: string,
    buildingId: string,
  ): Promise<RecommendationEvidencePacket> {
    const building = await this.resolveBuilding(buildingId, requestId);
    const areaIds = building.commercialAreas.map((area) => area.id);
    const [commerce, population] = await Promise.all([
      this.getCommerceEvidence(buildingId, areaIds, requestId),
      this.getPopulationEvidence(areaIds, requestId),
    ]);
    const profiles = await this.getProfiles(
      commerce.candidates.map((candidate) => candidate.code),
      requestId,
    );

    const missingData: Array<{ key: string; reason: string }> = [
      ...(areaIds.length === 0
        ? [{ key: 'commercialAreas', reason: '연결된 상권이 없습니다.' }]
        : []),
      ...(commerce.candidates.length === 0
        ? [{ key: 'commerce', reason: '상권 업종 통계가 없습니다.' }]
        : []),
      ...(population.totalPopulation === null
        ? [{ key: 'floatingPopulation', reason: '유동인구 통계가 없습니다.' }]
        : []),
      ...(profiles.length < commerce.candidates.length
        ? [{ key: 'businessProfiles', reason: '일부 업종 profile이 없습니다.' }]
        : []),
    ];

    return {
      building,
      commerce,
      population,
      profiles,
      missingData,
      dataAsOf: {
        commerce: commerce.sourcePeriod,
        floatingPopulation: population.sourcePeriod,
        profile: 'hackathon-v1',
      },
    };
  }

  private async resolveBuilding(
    buildingId: string,
    requestId: string,
  ): Promise<BuildingEvidence> {
    const [building] = await this.dataSource.query<BuildingRow[]>(
      `SELECT
         id::text AS id,
         COALESCE(road_address, jibun_address) AS address,
         building_name,
         ST_X(ST_Transform(ST_Centroid(geom), 4326))::text AS longitude,
         ST_Y(ST_Transform(ST_Centroid(geom), 4326))::text AS latitude
       FROM building
       WHERE id = $1`,
      [buildingId],
    );
    if (!building) {
      const error = new Error('건물을 찾을 수 없습니다.');
      error.name = 'BUILDING_NOT_FOUND';
      throw error;
    }

    let areas = await this.dataSource.query<CommercialAreaRow[]>(
      `SELECT
         ca.id::text AS id,
         ca.commercial_area_code AS code,
         ca.commercial_area_name AS name,
         ca.commercial_area_type AS type,
         cab.overlap_ratio::text AS overlap_ratio,
         NULL::numeric AS distance_meters,
         'DIRECT'::text AS relation
       FROM commercial_area_building cab
       JOIN commercial_area ca ON ca.id = cab.commercial_area_id
       WHERE cab.building_id = $1
       ORDER BY cab.overlap_ratio DESC NULLS LAST, ca.id
       LIMIT 5`,
      [buildingId],
    );

    if (areas.length === 0) {
      areas = await this.dataSource.query<CommercialAreaRow[]>(
        `SELECT
           ca.id::text AS id,
           ca.commercial_area_code AS code,
           ca.commercial_area_name AS name,
           ca.commercial_area_type AS type,
           NULL::numeric AS overlap_ratio,
           ST_Distance(ca.geom, b.geom)::text AS distance_meters,
           'SPATIAL_FALLBACK'::text AS relation
         FROM commercial_area ca
         JOIN building b ON b.id = $1
         WHERE ST_DWithin(ca.geom, b.geom, 500)
         ORDER BY ST_Distance(ca.geom, b.geom), ca.id
         LIMIT 3`,
        [buildingId],
      );
    }

    return {
      buildingId: building.id,
      address: building.address,
      buildingName: building.building_name,
      longitude: toNumber(building.longitude),
      latitude: toNumber(building.latitude),
      commercialAreas: areas.map((area) => ({
        id: area.id,
        code: area.code,
        name: area.name,
        type: area.type,
        overlapRatio: toNumber(area.overlap_ratio),
        distanceMeters: toNumber(area.distance_meters),
        relation: area.relation,
      })),
      evidenceId: `ev_${requestId}_location`,
    };
  }

  private async getCommerceEvidence(
    buildingId: string,
    commercialAreaIds: string[],
    requestId: string,
  ): Promise<CommerceEvidence> {
    if (commercialAreaIds.length === 0) {
      return {
        radiusMeters: [100, 300, 500],
        candidates: [],
        totalStoreCount: 0,
        sourcePeriod: null,
        evidenceId: `ev_${requestId}_commerce`,
      };
    }

    const rows = await this.dataSource.query<CommerceRow[]>(
      `WITH latest AS (
         SELECT DISTINCT ON (commercial_area_id, business_category_code)
           commercial_area_id,
           business_category_code,
           store_count,
           estimated_sales_amount,
           closure_rate,
           competition_score,
           demand_score,
           base_period
         FROM area_business_feature
         WHERE commercial_area_id = ANY($1::bigint[])
         ORDER BY commercial_area_id, business_category_code, base_period DESC
       ), nearby AS (
         SELECT
           COALESCE(s.service_business_category_code, s.business_category_code) AS code,
           COUNT(*)::text AS store_count
         FROM store s
         JOIN building b ON b.id = $2
         WHERE s.geom IS NOT NULL
           AND b.geom IS NOT NULL
           AND ST_DWithin(s.geom, ST_Centroid(b.geom), 500)
         GROUP BY COALESCE(s.service_business_category_code, s.business_category_code)
       )
       SELECT
         latest.business_category_code AS code,
         COALESCE(bc.name, latest.business_category_code) AS name,
         CASE WHEN COUNT(latest.store_count) = 0 THEN NULL
              ELSE SUM(latest.store_count)::text END AS store_count,
         nearby.store_count AS nearby_store_count,
         CASE WHEN COUNT(latest.estimated_sales_amount) = 0 THEN NULL
              ELSE SUM(latest.estimated_sales_amount)::text END AS estimated_sales_amount,
         CASE WHEN COUNT(latest.closure_rate) = 0 THEN NULL
              ELSE AVG(latest.closure_rate)::text END AS closure_rate,
         CASE WHEN COUNT(latest.competition_score) = 0 THEN NULL
              ELSE AVG(latest.competition_score)::text END AS competition_score,
         CASE WHEN COUNT(latest.demand_score) = 0 THEN NULL
              ELSE AVG(latest.demand_score)::text END AS demand_score,
         COUNT(DISTINCT latest.commercial_area_id)::text AS area_count,
         MAX(latest.base_period)::text AS source_period
       FROM latest
       LEFT JOIN business_category bc ON bc.code = latest.business_category_code
       LEFT JOIN nearby ON nearby.code = latest.business_category_code
       GROUP BY latest.business_category_code, bc.name, nearby.store_count
       ORDER BY COALESCE(AVG(latest.demand_score), 0) DESC,
                COALESCE(SUM(latest.store_count), 0) DESC,
                latest.business_category_code
       LIMIT 30`,
      [commercialAreaIds, buildingId],
    );

    const candidates: CommerceCandidateEvidence[] = rows.map((row) => ({
      code: row.code,
      name: row.name,
      storeCount: toInteger(row.store_count),
      nearbyStoreCount: toInteger(row.nearby_store_count),
      estimatedSalesAmount: toNumber(row.estimated_sales_amount),
      closureRate: toNumber(row.closure_rate),
      competitionScore: toNumber(row.competition_score),
      demandScore: toNumber(row.demand_score),
      areaCount: toInteger(row.area_count) ?? 0,
      evidenceId: `ev_${requestId}_commerce_${row.code}`,
    }));

    const totalStoreCount = candidates.reduce(
      (sum, candidate) => sum + (candidate.nearbyStoreCount ?? 0),
      0,
    );
    return {
      radiusMeters: [100, 300, 500],
      candidates,
      totalStoreCount,
      sourcePeriod:
        rows.find((row) => row.source_period)?.source_period ?? null,
      evidenceId: `ev_${requestId}_commerce`,
    };
  }

  private async getPopulationEvidence(
    commercialAreaIds: string[],
    requestId: string,
  ): Promise<PopulationEvidence> {
    const empty = {
      source_period: null,
      total_population: null,
      male_population: null,
      female_population: null,
      age_10s: null,
      age_20s: null,
      age_30s: null,
      age_40s: null,
      age_50s: null,
      age_60_plus: null,
      monday_population: null,
      tuesday_population: null,
      wednesday_population: null,
      thursday_population: null,
      friday_population: null,
      saturday_population: null,
      sunday_population: null,
      time_00_06: null,
      time_06_11: null,
      time_11_14: null,
      time_14_17: null,
      time_17_21: null,
      time_21_24: null,
    } satisfies PopulationRow;
    const [row] = commercialAreaIds.length
      ? await this.dataSource.query<PopulationRow[]>(
          `WITH latest AS (
             SELECT DISTINCT ON (commercial_area_id)
               *
             FROM commercial_area_floating_population_statistic
             WHERE commercial_area_id = ANY($1::bigint[])
             ORDER BY commercial_area_id, base_period DESC
           )
           SELECT
             MAX(base_period)::text AS source_period,
             SUM(total_population)::text AS total_population,
             SUM(male_population)::text AS male_population,
             SUM(female_population)::text AS female_population,
             SUM(age_10s)::text AS age_10s,
             SUM(age_20s)::text AS age_20s,
             SUM(age_30s)::text AS age_30s,
             SUM(age_40s)::text AS age_40s,
             SUM(age_50s)::text AS age_50s,
             SUM(age_60_plus)::text AS age_60_plus,
             SUM(monday_population)::text AS monday_population,
             SUM(tuesday_population)::text AS tuesday_population,
             SUM(wednesday_population)::text AS wednesday_population,
             SUM(thursday_population)::text AS thursday_population,
             SUM(friday_population)::text AS friday_population,
             SUM(saturday_population)::text AS saturday_population,
             SUM(sunday_population)::text AS sunday_population,
             SUM(time_00_06)::text AS time_00_06,
             SUM(time_06_11)::text AS time_06_11,
             SUM(time_11_14)::text AS time_11_14,
             SUM(time_14_17)::text AS time_14_17,
             SUM(time_17_21)::text AS time_17_21,
             SUM(time_21_24)::text AS time_21_24
           FROM latest`,
          [commercialAreaIds],
        )
      : [empty];
    const value = row ?? empty;
    const timeBands = [
      { timeRange: '00:00-06:00', population: toInteger(value.time_00_06) },
      { timeRange: '06:00-11:00', population: toInteger(value.time_06_11) },
      { timeRange: '11:00-14:00', population: toInteger(value.time_11_14) },
      { timeRange: '14:00-17:00', population: toInteger(value.time_14_17) },
      { timeRange: '17:00-21:00', population: toInteger(value.time_17_21) },
      { timeRange: '21:00-24:00', population: toInteger(value.time_21_24) },
    ].sort((left, right) => (right.population ?? -1) - (left.population ?? -1));

    return {
      totalPopulation: toInteger(value.total_population),
      malePopulation: toInteger(value.male_population),
      femalePopulation: toInteger(value.female_population),
      ageGroups: {
        TEENS: toInteger(value.age_10s),
        '20S': toInteger(value.age_20s),
        '30S': toInteger(value.age_30s),
        '40S': toInteger(value.age_40s),
        '50S': toInteger(value.age_50s),
        '60_PLUS': toInteger(value.age_60_plus),
      },
      dayOfWeek: {
        MONDAY: toInteger(value.monday_population),
        TUESDAY: toInteger(value.tuesday_population),
        WEDNESDAY: toInteger(value.wednesday_population),
        THURSDAY: toInteger(value.thursday_population),
        FRIDAY: toInteger(value.friday_population),
        SATURDAY: toInteger(value.saturday_population),
        SUNDAY: toInteger(value.sunday_population),
      },
      timeBands,
      sourcePeriod: value.source_period,
      evidenceId: `ev_${requestId}_population`,
    };
  }

  private async getProfiles(
    codes: string[],
    requestId: string,
  ): Promise<BusinessProfileEvidence[]> {
    if (codes.length === 0) return [];
    const rows = await this.dataSource.query<ProfileRow[]>(
      `SELECT
         business_category_code AS code,
         target_age_groups,
         peak_time_ranges,
         peak_day_types,
         floating_population_importance,
         resident_population_importance,
         worker_population_importance,
         delivery_compatibility,
         competition_tolerance,
         weekend_dependence,
         evening_dependence,
         confidence_level
       FROM business_category_analysis_profile
       WHERE business_category_code = ANY($1::varchar[])
         AND profile_version = 'hackathon-v1'
         AND is_active = true`,
      [codes],
    );
    return rows.map((row) => ({
      code: row.code,
      targetAgeGroups: toStringArray(row.target_age_groups),
      peakTimeRanges: toStringArray(row.peak_time_ranges),
      peakDayTypes: toStringArray(row.peak_day_types),
      floatingPopulationImportance: row.floating_population_importance,
      residentPopulationImportance: row.resident_population_importance,
      workerPopulationImportance: row.worker_population_importance,
      deliveryCompatibility: row.delivery_compatibility,
      competitionTolerance: row.competition_tolerance,
      weekendDependence: row.weekend_dependence,
      eveningDependence: row.evening_dependence,
      confidenceLevel: row.confidence_level,
      evidenceId: `ev_${requestId}_profile_${row.code}`,
    }));
  }
}
