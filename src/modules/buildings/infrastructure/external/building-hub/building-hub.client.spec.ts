import { ConfigService } from '@nestjs/config';
import { BuildingHubClient } from './building-hub.client';

describe('BuildingHubClient', () => {
  const query = {
    sigunguCd: '11110',
    bjdongCd: '10100',
    platGbCd: '0',
    bun: '0012',
    ji: '0000',
  };

  afterEach(() => jest.restoreAllMocks());

  it('maps JSON items and paginates until totalCount', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const response = (items: Record<string, unknown>[], totalCount: number) =>
      new Response(
        JSON.stringify({
          response: {
            header: { resultCode: '00' },
            body: { totalCount, items: { item: items } },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    fetchMock
      .mockResolvedValueOnce(
        response([{ mgmBldrgstPk: 'a', bldNm: '본관', platPlc: '서울' }], 2),
      )
      .mockResolvedValueOnce(response([], 0))
      .mockResolvedValueOnce(response([], 0))
      .mockResolvedValueOnce(
        response(
          [{ mgmBldrgstPk: 'a', hsprc: '450000000', crtnDay: '20260101' }],
          1,
        ),
      )
      .mockResolvedValueOnce(
        response([{ mgmBldrgstPk: 'b', bldNm: '별관', platPlc: '서울' }], 2),
      );
    const client = new BuildingHubClient(
      new ConfigService({
        BUILDING_HUB_SERVICE_KEY: 'test%2Bkey%3D',
        BUILDING_HUB_TIMEOUT_MS: '1000',
      }),
    );

    const result = await client.fetchByParcel(query);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.basis.map((item) => item.mgmBldrgstPk)).toEqual(['a', 'b']);
    expect(result.housingPrices).toEqual([
      {
        mgmBldrgstPk: 'a',
        housingPrice: 450000000,
        sourceCreatedAt: '20260101',
      },
    ]);
    const firstRequest = fetchMock.mock.calls[0]?.[0];
    if (!(firstRequest instanceof URL)) {
      throw new Error(
        'Expected the building hub request to use a URL instance.',
      );
    }

    expect(firstRequest.pathname).toBe(
      '/1613000/BldRgstHubService/getBrBasisOulnInfo',
    );
    expect(firstRequest.searchParams.get('serviceKey')).toBe('test+key=');
    const requestedPaths = fetchMock.mock.calls.map((call) => {
      const request = call[0];
      return request instanceof URL ? request.pathname : null;
    });
    expect(requestedPaths).toContain(
      '/1613000/BldRgstHubService/getBrHsprcInfo',
    );
  });

  it('classifies data.go.kr service-key errors without hiding them as HTTP errors', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          cmmMsgHeader: {
            errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
            returnAuthMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
            returnReasonCode: '30',
          },
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new BuildingHubClient(
      new ConfigService({ BUILDING_HUB_SERVICE_KEY: 'test-key' }),
    );

    await expect(client.fetchByParcel(query)).rejects.toMatchObject({
      code: 'REGISTRY_AUTH_ERROR',
    });
  });

  it('rejects non-JSON responses', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('<xml />', { status: 200 }));
    const client = new BuildingHubClient(
      new ConfigService({ BUILDING_HUB_SERVICE_KEY: 'test-key' }),
    );

    await expect(client.fetchByParcel(query)).rejects.toMatchObject({
      code: 'REGISTRY_INVALID_RESPONSE',
    });
  });
});
