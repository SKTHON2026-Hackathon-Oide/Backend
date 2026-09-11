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
        response([{ mgmBldrgstPk: 'b', bldNm: '별관', platPlc: '서울' }], 2),
      );
    const client = new BuildingHubClient(
      new ConfigService({
        BUILDING_HUB_SERVICE_KEY: 'test%2Bkey%3D',
        BUILDING_HUB_TIMEOUT_MS: '1000',
      }),
    );

    const result = await client.fetchByParcel(query);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.basis.map((item) => item.mgmBldrgstPk)).toEqual(['a', 'b']);
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
