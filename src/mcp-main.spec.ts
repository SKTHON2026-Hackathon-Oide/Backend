import request from 'supertest';
import { createApp } from './mcp-main';
import { SqlRecommendationEvidenceCollector } from './modules/recommendations/infrastructure/evidence/sql-recommendation-evidence.collector';
import { SqlBusinessLocationEvidenceCollector } from './modules/recommendations/infrastructure/evidence/sql-business-location-evidence.collector';

describe('MCP container HTTP access', () => {
  const collector = { collect: jest.fn() };
  const businessCollector = { collect: jest.fn() };
  const app = createApp(
    collector as unknown as SqlRecommendationEvidenceCollector,
    businessCollector as unknown as SqlBusinessLocationEvidenceCollector,
  );

  it.each(['10.0.2.15:3001', 'mcp:3001', '127.0.0.1:3001'])(
    'allows health, initialization and tool discovery through Host %s',
    async (host) => {
      await request(app).get('/health').set('Host', host).expect(200);
      const initialize = await request(app)
        .post('/mcp')
        .set('Host', host)
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'container-regression-test', version: '1.0' },
          },
        })
        .expect(200);
      expect(initialize.text).toContain('skthon-location-recommendation');

      const tools = await request(app)
        .post('/mcp')
        .set('Host', host)
        .set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
        .expect(200);
      expect(tools.text).toContain(
        'get_business_location_recommendation_evidence',
      );
      expect(tools.text).toContain('get_location_recommendation_evidence');
      expect(collector.collect).not.toHaveBeenCalled();
      expect(businessCollector.collect).not.toHaveBeenCalled();
    },
  );
});
