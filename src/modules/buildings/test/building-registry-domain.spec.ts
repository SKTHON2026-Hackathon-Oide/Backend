import { PnuBuildingHubQueryFactory } from '../domain/services/pnu-building-hub-query.factory';
import { BuildingLedgerMatchService } from '../domain/services/building-ledger-match.service';
import { RegistrySpaceOptionService } from '../domain/services/registry-space-option.service';

describe('building registry domain services', () => {
  it('converts a normal, mountain, and sub-lot PNU without losing zero padding', () => {
    const factory = new PnuBuildingHubQueryFactory();
    expect(factory.create('1111010100100120000')).toEqual({
      sigunguCd: '11110',
      bjdongCd: '10100',
      platGbCd: '0',
      bun: '0012',
      ji: '0000',
    });
    expect(factory.create('1111010100200120000').platGbCd).toBe('1');
    expect(factory.create('1111010100300120000').platGbCd).toBe('2');
    expect(factory.create('1111010100000120003').ji).toBe('0003');
    expect(() => factory.create('123')).toThrow();
    expect(() => factory.create('1111010100A0120000')).toThrow();
  });

  it('does not auto-select two similarly scored registry buildings', () => {
    const service = new BuildingLedgerMatchService();
    const result = service.match(
      {
        buildingId: '1',
        pnu: '1111010100100120000',
        buildingName: '테스트빌딩',
        jibunAddress: '서울 종로구 1-2',
        mainUseName: '제2종근린생활시설',
        groundFloorCount: 5,
        undergroundFloorCount: 1,
        totalFloorAreaSqm: 1000,
      },
      [
        {
          mgmBldrgstPk: 'a',
          buildingName: '테스트빌딩',
          address: '서울 종로구 1-2',
          mainUseCode: null,
          mainUseName: '제2종근린생활시설',
          aboveGroundFloorCount: 5,
          belowGroundFloorCount: 1,
          totalFloorAreaSqm: 1000,
          sourceCreatedAt: '20260911',
        },
        {
          mgmBldrgstPk: 'b',
          buildingName: '테스트빌딩',
          address: '서울 종로구 1-2',
          mainUseCode: null,
          mainUseName: '제2종근린생활시설',
          aboveGroundFloorCount: 5,
          belowGroundFloorCount: 1,
          totalFloorAreaSqm: 1000,
          sourceCreatedAt: '20260911',
        },
      ],
    );

    expect(result.status).toBe('AMBIGUOUS');
    expect(result.selected).toBeNull();
  });

  it('sums exclusive/common area rows and keeps floor-only options separate', () => {
    const service = new RegistrySpaceOptionService();
    const units = service.create(
      [
        {
          mgmBldrgstPk: 'a',
          dongName: '주건축물',
          floor: 1,
          floorName: '지상 1층',
          unitName: '101호',
          areaSqm: 30.1,
          areaKind: 'EXCLUSIVE',
          registeredUseCode: '1000',
          registeredUseName: '일반음식점',
        },
        {
          mgmBldrgstPk: 'a',
          dongName: '주건축물',
          floor: 1,
          floorName: '지상 1층',
          unitName: '101호',
          areaSqm: 2.2,
          areaKind: 'COMMON',
          registeredUseCode: '1000',
          registeredUseName: '일반음식점',
        },
      ],
      [],
    );
    expect(units).toHaveLength(1);
    expect(units[0].exclusiveAreaSqm).toBe(30.1);
    expect(units[0].commonAreaSqm).toBe(2.2);

    const floors = service.create(
      [],
      [
        {
          mgmBldrgstPk: 'a',
          dongName: '주건축물',
          floor: 2,
          floorName: '지상 2층',
          floorAreaSqm: 120,
          mainUseCode: '2000',
          mainUseName: '사무소',
        },
      ],
    );
    expect(floors[0].floorAreaSqm).toBe(120);
    expect(floors[0].exclusiveAreaSqm).toBeNull();
  });
});
