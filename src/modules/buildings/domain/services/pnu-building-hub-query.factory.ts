import { SpaceAnalysisContextError } from './space-analysis-context.error';
import { BuildingHubQuery } from '../ports/building-registry.gateway.port';

const PNU_LENGTH = 19;

export class PnuBuildingHubQueryFactory {
  create(pnu: string | null | undefined): BuildingHubQuery {
    if (!pnu || !/^\d{19}$/.test(pnu)) {
      throw new SpaceAnalysisContextError(
        'PNU_UNAVAILABLE',
        '건축물대장 조회에 필요한 유효한 PNU가 없습니다.',
      );
    }

    if (pnu.length !== PNU_LENGTH) {
      throw new SpaceAnalysisContextError(
        'PNU_UNAVAILABLE',
        'PNU는 19자리 숫자여야 합니다.',
      );
    }

    return {
      sigunguCd: pnu.slice(0, 5),
      bjdongCd: pnu.slice(5, 10),
      platGbCd: this.toBuildingHubPlatGbCd(pnu.slice(10, 11)),
      bun: pnu.slice(11, 15),
      ji: pnu.slice(15, 19),
    };
  }

  private toBuildingHubPlatGbCd(pnuLandType: string): string {
    // PNU: 1=일반, 2=산, 3=블록. Building HUB: 0=대지, 1=산, 2=블록.
    // Some preprocessed legacy datasets already store 0 for ordinary land.
    const buildingHubCode: Record<string, string> = {
      '0': '0',
      '1': '0',
      '2': '1',
      '3': '2',
    };
    const result = buildingHubCode[pnuLandType];
    if (result) return result;

    throw new SpaceAnalysisContextError(
      'PNU_UNAVAILABLE',
      'PNU의 토지구분코드를 건축물대장 대지구분코드로 변환할 수 없습니다.',
    );
  }
}
