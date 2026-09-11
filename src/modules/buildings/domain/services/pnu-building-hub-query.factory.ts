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
      platGbCd: pnu.slice(10, 11),
      bun: pnu.slice(11, 15),
      ji: pnu.slice(15, 19),
    };
  }
}
