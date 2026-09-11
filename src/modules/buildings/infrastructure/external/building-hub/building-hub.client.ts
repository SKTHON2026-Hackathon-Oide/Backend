import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BuildingHubAreaKind,
  BuildingHubAreaRecord,
  BuildingHubBasisRecord,
  BuildingHubFloorRecord,
  BuildingHubQuery,
  BuildingRegistryGateway,
  BuildingRegistryRawData,
} from '../../../domain/ports/building-registry.gateway.port';
import { BuildingHubClientError, BuildingHubPage } from './building-hub.types';

const DEFAULT_BASE_URL = 'https://apis.data.go.kr/1613000/BldRgstHubService';
const MAX_RETRIES = 2;
const PAGE_SIZE = 100;

@Injectable()
export class BuildingHubClient implements BuildingRegistryGateway {
  constructor(private readonly config: ConfigService) {}

  async fetchByParcel(
    query: BuildingHubQuery,
  ): Promise<BuildingRegistryRawData> {
    const serviceKey = this.config.get<string>('BUILDING_HUB_SERVICE_KEY');
    if (!serviceKey) {
      throw new BuildingHubClientError(
        'REGISTRY_CONFIGURATION_ERROR',
        'BUILDING_HUB_SERVICE_KEY가 설정되지 않았습니다.',
      );
    }
    const normalizedServiceKey = this.normalizeServiceKey(serviceKey);

    const [basisPage, floorPage, areaPage] = await Promise.all([
      this.fetchAll('getBrBasisOulnInfo', normalizedServiceKey, query),
      this.fetchAll('getBrFlrOulnInfo', normalizedServiceKey, query),
      this.fetchAll('getBrExposPubuseAreaInfo', normalizedServiceKey, query),
    ]);

    return {
      basis: basisPage.items.map((item) => this.mapBasis(item)),
      floors: floorPage.items.map((item) => this.mapFloor(item)),
      areas: areaPage.items.map((item) => this.mapArea(item)),
      rawResponse: {
        basis: basisPage.raw,
        floors: floorPage.raw,
        areas: areaPage.raw,
      },
    };
  }

  private async fetchAll(
    endpoint: string,
    serviceKey: string,
    query: BuildingHubQuery,
  ): Promise<BuildingHubPage> {
    let pageNo = 1;
    let totalCount = 0;
    const items: Record<string, unknown>[] = [];
    let firstRaw: unknown = null;

    do {
      const page = await this.fetchPage(endpoint, serviceKey, query, pageNo);
      if (pageNo === 1) firstRaw = page.raw;
      totalCount = page.totalCount;
      items.push(...page.items);
      pageNo += 1;
      if (page.items.length === 0) break;
    } while (items.length < totalCount);

    return { totalCount, items, raw: firstRaw };
  }

  private async fetchPage(
    endpoint: string,
    serviceKey: string,
    query: BuildingHubQuery,
    pageNo: number,
  ): Promise<BuildingHubPage> {
    const baseUrl = this.config.get<string>(
      'BUILDING_HUB_BASE_URL',
      DEFAULT_BASE_URL,
    );
    const timeoutMs = Number(
      this.config.get<string>('BUILDING_HUB_TIMEOUT_MS', '5000'),
    );
    const url = new URL(
      endpoint.replace(/^\/+/, ''),
      `${baseUrl.replace(/\/$/, '')}/`,
    );
    url.search = new URLSearchParams({
      serviceKey,
      sigunguCd: query.sigunguCd,
      bjdongCd: query.bjdongCd,
      platGbCd: query.platGbCd,
      bun: query.bun,
      ji: query.ji,
      _type: 'json',
      numOfRows: String(PAGE_SIZE),
      pageNo: String(pageNo),
    }).toString();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        const rawText = await response.text();
        if (!response.ok) {
          const providerError = this.providerError(rawText);
          if (providerError) throw providerError;
          if (response.status >= 500 && attempt < MAX_RETRIES) continue;
          throw new BuildingHubClientError(
            'REGISTRY_HTTP_ERROR',
            `건축물대장 API HTTP ${response.status} 응답입니다.`,
          );
        }
        const raw = this.parseJson(rawText);
        return this.parsePage(raw);
      } catch (error) {
        if (error instanceof BuildingHubClientError) throw error;
        if (controller.signal.aborted) {
          if (attempt < MAX_RETRIES) continue;
          throw new BuildingHubClientError(
            'REGISTRY_TIMEOUT',
            '건축물대장 API 응답 시간이 초과되었습니다.',
          );
        }
        if (attempt < MAX_RETRIES) continue;
        throw new BuildingHubClientError(
          'REGISTRY_HTTP_ERROR',
          '건축물대장 API 요청에 실패했습니다.',
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new BuildingHubClientError(
      'REGISTRY_HTTP_ERROR',
      '건축물대장 API 요청에 실패했습니다.',
    );
  }

  private parseJson(rawText: string): unknown {
    try {
      return JSON.parse(rawText) as unknown;
    } catch {
      throw new BuildingHubClientError(
        'REGISTRY_INVALID_RESPONSE',
        '건축물대장 API가 JSON이 아닌 응답을 반환했습니다.',
      );
    }
  }

  private parsePage(raw: unknown): BuildingHubPage {
    const root = this.asRecord(raw);
    if (!root.response && !root.body) {
      const providerError = this.providerErrorFromJson(root);
      if (providerError) throw providerError;
      throw new BuildingHubClientError(
        'REGISTRY_INVALID_RESPONSE',
        '건축물대장 API 응답 구조가 올바르지 않습니다.',
      );
    }
    const response = this.asRecord(root.response ?? raw);
    const header = this.asRecord(response.header);
    const resultCode = this.asString(header.resultCode ?? header.result_code);
    if (resultCode && !['00', '0', 'INFO-000'].includes(resultCode)) {
      throw new BuildingHubClientError(
        'REGISTRY_INVALID_RESPONSE',
        `건축물대장 API 오류 코드 ${resultCode} 응답입니다.`,
      );
    }
    const body = this.asRecord(response.body);
    if (!response.body || Object.keys(body).length === 0) {
      throw new BuildingHubClientError(
        'REGISTRY_INVALID_RESPONSE',
        '건축물대장 API 응답에 body가 없습니다.',
      );
    }
    const itemsObject = this.asRecord(body.items);
    const rawItems = itemsObject.item ?? body.item ?? [];
    const items = Array.isArray(rawItems)
      ? rawItems.map((item) => this.asRecord(item))
      : rawItems && typeof rawItems === 'object'
        ? [this.asRecord(rawItems)]
        : [];
    const totalCount = Number(
      body.totalCount ?? body.total_count ?? items.length,
    );
    if (!Number.isFinite(totalCount) || totalCount < 0) {
      throw new BuildingHubClientError(
        'REGISTRY_INVALID_RESPONSE',
        '건축물대장 API의 totalCount가 올바르지 않습니다.',
      );
    }
    return { totalCount, items, raw };
  }

  private normalizeServiceKey(serviceKey: string): string {
    try {
      // data.go.kr's "Encoding" key is already percent-encoded. URLSearchParams
      // encodes query values itself, so normalize it first to avoid % becoming %25.
      return decodeURIComponent(serviceKey);
    } catch {
      return serviceKey;
    }
  }

  private providerError(rawText: string): BuildingHubClientError | null {
    try {
      return this.providerErrorFromJson(this.asRecord(JSON.parse(rawText)));
    } catch {
      return null;
    }
  }

  private providerErrorFromJson(
    raw: Record<string, unknown>,
  ): BuildingHubClientError | null {
    const header = this.asRecord(raw.cmmMsgHeader ?? raw.header);
    const reasonCode = this.asString(
      header.returnReasonCode ?? header.resultCode ?? header.result_code,
    );
    const message = this.asString(
      header.returnAuthMsg ??
        header.errMsg ??
        header.resultMsg ??
        header.result_msg,
    );
    if (!reasonCode && !message) return null;

    const isAuthenticationError = ['20', '30', '31'].includes(reasonCode ?? '');
    return new BuildingHubClientError(
      isAuthenticationError ? 'REGISTRY_AUTH_ERROR' : 'REGISTRY_HTTP_ERROR',
      `건축물대장 API 오류${reasonCode ? ` 코드 ${reasonCode}` : ''}${message ? `: ${message}` : ''}`,
    );
  }

  private mapBasis(item: Record<string, unknown>): BuildingHubBasisRecord {
    return {
      mgmBldrgstPk: this.string(item.mgmBldrgstPk),
      buildingName: this.string(item.bldNm ?? item.bldNmList),
      address: this.string(item.platPlc ?? item.platPlcList),
      mainUseCode: this.string(item.mainPurpsCd),
      mainUseName: this.string(item.mainPurpsCdNm),
      aboveGroundFloorCount: this.number(item.grndFlrCnt),
      belowGroundFloorCount: this.number(item.ugrndFlrCnt),
      totalFloorAreaSqm: this.number(item.totArea),
      sourceCreatedAt: this.string(item.crtnDay ?? item.pmsDay),
    };
  }

  private mapFloor(item: Record<string, unknown>): BuildingHubFloorRecord {
    return {
      mgmBldrgstPk: this.string(item.mgmBldrgstPk),
      dongName: this.string(item.dongNm),
      floor: this.number(item.flrNo),
      floorName: this.string(item.flrNoNm),
      floorAreaSqm: this.number(item.area),
      mainUseCode: this.string(item.mainPurpsCd),
      mainUseName: this.string(item.mainPurpsCdNm),
    };
  }

  private mapArea(item: Record<string, unknown>): BuildingHubAreaRecord {
    const areaKind = this.areaKind(
      item.exposPubuseGbCd,
      item.exposPubuseGbNm ?? item.exposPubuseGbCdNm,
    );
    return {
      mgmBldrgstPk: this.string(item.mgmBldrgstPk),
      dongName: this.string(item.dongNm),
      floor: this.number(item.flrNo),
      floorName: this.string(item.flrNoNm),
      unitName: this.string(item.hoNm),
      areaSqm: this.number(item.area),
      areaKind,
      registeredUseCode: this.string(item.mainPurpsCd),
      registeredUseName: this.string(item.mainPurpsCdNm),
    };
  }

  private areaKind(code: unknown, name: unknown): BuildingHubAreaKind {
    const normalizedCode = this.string(code);
    const normalizedName = this.string(name) ?? '';
    if (normalizedName.includes('전유') || normalizedCode === '1')
      return 'EXCLUSIVE';
    if (normalizedName.includes('공용') || normalizedCode === '2')
      return 'COMMON';
    return 'UNKNOWN';
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asString(value: unknown): string | null {
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : null;
  }

  private string(value: unknown): string | null {
    const result = this.asString(value);
    return result?.trim() || null;
  }

  private number(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
}
