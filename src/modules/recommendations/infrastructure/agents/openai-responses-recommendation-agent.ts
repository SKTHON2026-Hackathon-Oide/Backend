import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  RecommendationAgentContext,
  RecommendationAgentPort,
} from '../../domain/ports/recommendation-agent.port';
import {
  RecommendationAgentOutput,
  RecommendationEvidencePacket,
  SCORE_WEIGHTS,
} from '../../domain/recommendation.types';

const RECOMMENDATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'recommendations',
    'topOperatingTimeBands',
    'dataAsOf',
    'missingData',
  ],
  properties: {
    summary: { type: 'string' },
    recommendations: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'rank',
          'businessCategoryCode',
          'businessCategoryName',
          'totalScore',
          'scoreBreakdown',
          'recommendedOperatingHours',
          'reasons',
          'risks',
          'evidenceIds',
        ],
        properties: {
          rank: { type: 'integer', minimum: 1, maximum: 5 },
          businessCategoryCode: { type: 'string' },
          businessCategoryName: { type: 'string' },
          totalScore: { type: 'number', minimum: 0, maximum: 100 },
          scoreBreakdown: {
            type: 'object',
            additionalProperties: false,
            required: [
              'demand',
              'supplyOpportunity',
              'customerFit',
              'timeFit',
              'competitionHealth',
              'dataConfidence',
            ],
            properties: {
              demand: { type: 'number', minimum: 0, maximum: 100 },
              supplyOpportunity: { type: 'number', minimum: 0, maximum: 100 },
              customerFit: { type: 'number', minimum: 0, maximum: 100 },
              timeFit: { type: 'number', minimum: 0, maximum: 100 },
              competitionHealth: { type: 'number', minimum: 0, maximum: 100 },
              dataConfidence: { type: 'number', minimum: 0, maximum: 100 },
            },
          },
          recommendedOperatingHours: {
            type: 'array',
            items: { type: 'string' },
          },
          reasons: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          evidenceIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    topOperatingTimeBands: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['timeRange', 'population'],
        properties: {
          timeRange: { type: 'string' },
          population: { type: ['number', 'null'] },
        },
      },
    },
    dataAsOf: {
      type: 'object',
      additionalProperties: false,
      required: ['commerce', 'floatingPopulation', 'profile'],
      properties: {
        commerce: { type: ['string', 'null'] },
        floatingPopulation: { type: ['string', 'null'] },
        profile: { type: ['string', 'null'] },
      },
    },
    missingData: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'reason'],
        properties: { key: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
} as const;

@Injectable()
export class OpenAiResponsesRecommendationAgent implements RecommendationAgentPort {
  constructor(private readonly config: ConfigService) {}

  async generate(
    packet: RecommendationEvidencePacket,
    context?: RecommendationAgentContext,
  ): Promise<RecommendationAgentOutput> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const mcpServerUrl = this.config.get<string>(
      'RECOMMENDATION_MCP_SERVER_URL',
    );
    if (!apiKey || !context) {
      const error = new Error(
        'OpenAI agent는 OPENAI_API_KEY 설정이 필요합니다.',
      );
      error.name = 'RECOMMENDATION_AGENT_NOT_CONFIGURED';
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const tools = mcpServerUrl
        ? [
            {
              type: 'mcp',
              server_label: this.config.get<string>(
                'RECOMMENDATION_MCP_SERVER_LABEL',
                'location-recommendation',
              ),
              server_url: mcpServerUrl,
              require_approval: 'never',
            },
          ]
        : undefined;
      const response = await fetch(
        `${this.config.get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1')}/responses`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.get<string>('OPENAI_MODEL', 'gpt-5.6-sol'),
            store: false,
            instructions: this.instructions(),
            input: JSON.stringify({
              requestId: context.requestId,
              buildingId: context.buildingId,
              evidencePacket: packet,
            }),
            ...(tools ? { tools } : {}),
            text: {
              format: {
                type: 'json_schema',
                name: 'location_business_recommendation',
                strict: true,
                schema: RECOMMENDATION_SCHEMA,
              },
            },
          }),
        },
      );
      if (!response.ok) {
        const error = new Error(
          `OpenAI Responses API returned ${response.status}.`,
        );
        error.name =
          response.status >= 500 ? 'MODEL_TIMEOUT' : 'INVALID_MODEL_OUTPUT';
        throw error;
      }
      const body = (await response.json()) as Record<string, unknown>;
      return this.parseOutput(body);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error(
          'OpenAI agent 호출 시간이 초과되었습니다.',
        );
        timeoutError.name = 'MODEL_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private instructions(): string {
    return `
당신은 서울시 건물 위치 기반 업종 추천 에이전트다.
입력 evidence packet과 MCP 도구가 제공하는 실제 데이터만 사용한다. MCP가 제공되지 않은
업종·수치·상권을 만들어내지 말고 결측은 0으로 바꾸지 않는다. 후보 업종 집합 안에서만
최대 5개를 선택한다. 층·면적·임대료·공실 여부를 알고 있다고 주장하지 않는다.

각 점수는 0~100점으로 계산하고 총점은 다음 가중합을 사용한다: demand ${SCORE_WEIGHTS.demand},
supplyOpportunity ${SCORE_WEIGHTS.supplyOpportunity}, customerFit ${SCORE_WEIGHTS.customerFit},
timeFit ${SCORE_WEIGHTS.timeFit}, competitionHealth ${SCORE_WEIGHTS.competitionHealth},
dataConfidence ${SCORE_WEIGHTS.dataConfidence}. 모든 이유에는 실제 evidenceId를 연결한다.
영업시간은 업종 profile 피크 시간대와 실제 유동인구가 높은 시간대를 함께 고려한다.
통계 기준 시점과 결측·대체 지표를 결과에 명시한다. 결과는 의사결정 보조이며 성공이나
수익을 보장하지 않는다.
`.trim();
  }

  private parseOutput(
    body: Record<string, unknown>,
  ): RecommendationAgentOutput {
    try {
      const outputText = body.output_text;
      if (typeof outputText === 'string') {
        return JSON.parse(outputText) as RecommendationAgentOutput;
      }
      const output = body.output;
      if (Array.isArray(output)) {
        for (const item of output) {
          if (!item || typeof item !== 'object') continue;
          const content = (item as { content?: unknown }).content;
          if (!Array.isArray(content)) continue;
          for (const part of content) {
            if (!part || typeof part !== 'object') continue;
            const text = (part as { text?: unknown }).text;
            if (typeof text === 'string') {
              return JSON.parse(text) as RecommendationAgentOutput;
            }
          }
        }
      }
    } catch {
      const error = new Error(
        'OpenAI Responses API의 JSON 출력이 올바르지 않습니다.',
      );
      error.name = 'INVALID_MODEL_OUTPUT';
      throw error;
    }
    const error = new Error(
      'OpenAI Responses API의 구조화 출력을 찾을 수 없습니다.',
    );
    error.name = 'INVALID_MODEL_OUTPUT';
    throw error;
  }
}
