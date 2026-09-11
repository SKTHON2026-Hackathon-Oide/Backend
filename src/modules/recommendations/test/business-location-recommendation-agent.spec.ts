import { DeterministicBusinessLocationRecommendationAgent } from '../infrastructure/agents/deterministic-business-location-recommendation-agent';
import { BusinessLocationEvidencePacket } from '../domain/business-location-recommendation.types';

describe('DeterministicBusinessLocationRecommendationAgent', () => {
  it('ranks at most five candidate areas and keeps scores in range', async () => {
    const packet: BusinessLocationEvidencePacket = {
      input: {
        requestId: '1',
        businessCategoryCode: 'CS100010',
        businessCategoryName: '커피-음료',
        longitude: 127,
        latitude: 37.5,
        preferredArea: {
          id: '10',
          code: '11110515',
          name: '종로구 종로1·2·3·4가동',
          areaType: 'DONG',
          parentId: '1',
          parentCode: '11110',
          parentName: '종로구',
          matchMethod: 'CONTAINS',
        },
        operatingHours: { opensAt: '09:00', closesAt: '22:00' },
      },
      candidates: Array.from({ length: 6 }, (_, index) => ({
        commercialAreaId: String(index + 1),
        commercialAreaCode: `A${index}`,
        commercialAreaName: `상권${index}`,
        commercialAreaType: '골목상권',
        administrativeAreaCode: '11110515',
        administrativeAreaName: '종로구 종로1·2·3·4가동',
        longitude: 127,
        latitude: 37.5,
        overlapRatio: 1,
        distanceMeters: 0,
        demandScore: 80 - index,
        competitionScore: 20,
        storeCount: 3 + index,
        estimatedSalesAmount: 1000000,
        closureRate: 0.1,
        population: {
          total: 10000,
          ageGroups: { '20S': 4000, '30S': 3000, '40S': 2000 },
          timeBands: [
            { timeRange: '09:00-11:00', population: 1000 },
            { timeRange: '11:00-14:00', population: 2000 },
            { timeRange: '17:00-21:00', population: 3000 },
          ],
        },
        profile: {
          targetAgeGroups: ['20S', '30S'],
          peakTimeRanges: ['TIME_17_21'],
          confidenceLevel: 'HIGH',
        },
        sourcePeriods: {
          commerce: '2026-06-30',
          population: '2026-06-30',
          profile: 'hackathon-v1',
        },
        evidenceIds: [`ev_${index}`],
      })),
      missingData: [],
      dataAsOf: {
        commerce: '2026-06-30',
        floatingPopulation: '2026-06-30',
        profile: 'hackathon-v1',
      },
    };
    const output =
      await new DeterministicBusinessLocationRecommendationAgent().generate(
        packet,
      );
    expect(output.recommendations).toHaveLength(5);
    expect(output.recommendations.map((item) => item.rank)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(
      output.recommendations.every(
        (item) => item.totalScore >= 0 && item.totalScore <= 100,
      ),
    ).toBe(true);
  });
});
