import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { DataSource } from 'typeorm';
import * as z from 'zod/v4';
import { SqlRecommendationEvidenceCollector } from './modules/recommendations/infrastructure/evidence/sql-recommendation-evidence.collector';
import { SqlBusinessLocationEvidenceCollector } from './modules/recommendations/infrastructure/evidence/sql-business-location-evidence.collector';

const port = Number(process.env.MCP_PORT ?? 3001);

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'skthon',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'skthon',
  logging: process.env.DB_LOGGING === 'true',
  ssl:
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

function createServer(
  collector: SqlRecommendationEvidenceCollector,
  businessLocationCollector: SqlBusinessLocationEvidenceCollector,
): McpServer {
  const server = new McpServer({
    name: 'skthon-location-recommendation',
    version: '1.0.0',
  });

  server.registerTool(
    'get_location_recommendation_evidence',
    {
      title: '건물 위치 기반 추천 근거 조회',
      description:
        '건물 ID의 상권, 점포, 성별·연령대·시간대 유동인구, 업종 프로파일 근거를 조회합니다.',
      inputSchema: {
        requestId: z.string().min(1),
        buildingId: z.string().regex(/^[1-9]\\d*$/),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ requestId, buildingId }) => {
      try {
        const evidence = await collector.collect(requestId, buildingId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(evidence),
            },
          ],
          structuredContent: evidence as unknown as Record<string, unknown>,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '근거 조회에 실패했습니다.';
        return {
          content: [{ type: 'text', text: message }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'get_business_location_recommendation_evidence',
    {
      title: '희망 업종·선호지역 상권 추천 근거 조회',
      description:
        '선택 업종과 행정구역에 대해 상권 후보·수요·경쟁·유동인구·영업시간 근거를 반환합니다.',
      inputSchema: {
        requestId: z.string().min(1),
        businessCategoryCode: z.string().min(1),
        businessCategoryName: z.string().min(1),
        longitude: z.number().min(124).max(132),
        latitude: z.number().min(33).max(39),
        preferredArea: z.object({
          id: z.string().regex(/^[1-9]\\d*$/),
          code: z.string().min(1),
          name: z.string().min(1),
          areaType: z.string().min(1),
          parentId: z.string().nullable(),
          parentCode: z.string().nullable(),
          parentName: z.string().nullable(),
          matchMethod: z.enum(['CONTAINS', 'BOUNDARY']),
        }),
        operatingHours: z.object({ opensAt: z.string(), closesAt: z.string() }),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const evidence = await businessLocationCollector.collect(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(evidence) }],
          structuredContent: evidence as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text:
                error instanceof Error
                  ? error.message
                  : '상권 근거 조회에 실패했습니다.',
            },
          ],
          isError: true,
        };
      }
    },
  );
  return server;
}

async function bootstrap(): Promise<void> {
  await dataSource.initialize();
  const collector = new SqlRecommendationEvidenceCollector(dataSource);
  const businessLocationCollector = new SqlBusinessLocationEvidenceCollector(
    dataSource,
  );
  const app = createMcpExpressApp();

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.post('/mcp', async (request, response) => {
    const server = createServer(collector, businessLocationCollector);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP server error.' },
          id: null,
        });
      }
      console.error(error);
    } finally {
      response.once('close', () => void transport.close());
    }
  });

  app.all('/mcp', (_request, response) => {
    response.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`Location recommendation MCP server listening on ${port}`);
  });
}

void bootstrap();
