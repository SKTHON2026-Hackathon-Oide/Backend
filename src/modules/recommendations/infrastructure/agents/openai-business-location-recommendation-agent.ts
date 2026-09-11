import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BusinessLocationEvidencePacket,
  BusinessLocationRecommendationOutput,
} from '../../domain/business-location-recommendation.types';
import type { BusinessLocationRecommendationAgentPort } from '../../domain/ports/business-location-recommendation-agent.port';

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'recommendations',
    'warnings',
    'dataLimitations',
    'dataAsOf',
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
          'commercialAreaId',
          'commercialAreaCode',
          'commercialAreaName',
          'administrativeArea',
          'longitude',
          'latitude',
          'totalScore',
          'scoreBreakdown',
          'oneLineReason',
          'evidence',
          'operatingHourFit',
          'risks',
          'operatingTips',
          'evidenceIds',
        ],
        properties: {
          rank: { type: 'integer', minimum: 1, maximum: 5 },
          commercialAreaId: { type: 'string' },
          commercialAreaCode: { type: 'string' },
          commercialAreaName: { type: 'string' },
          administrativeArea: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'name'],
            properties: {
              code: { type: ['string', 'null'] },
              name: { type: ['string', 'null'] },
            },
          },
          longitude: { type: ['number', 'null'] },
          latitude: { type: ['number', 'null'] },
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
              demand: { type: 'number' },
              supplyOpportunity: { type: 'number' },
              customerFit: { type: 'number' },
              timeFit: { type: 'number' },
              competitionHealth: { type: 'number' },
              dataConfidence: { type: 'number' },
            },
          },
          oneLineReason: { type: 'string' },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['metric', 'value', 'unit', 'interpretation'],
              properties: {
                metric: { type: 'string' },
                value: { type: ['string', 'number', 'null'] },
                unit: { type: ['string', 'null'] },
                interpretation: { type: 'string' },
              },
            },
          },
          operatingHourFit: {
            type: 'object',
            additionalProperties: false,
            required: ['score', 'matchedTimeBands', 'explanation'],
            properties: {
              score: { type: 'number' },
              matchedTimeBands: { type: 'array', items: { type: 'string' } },
              explanation: { type: 'string' },
            },
          },
          risks: { type: 'array', items: { type: 'string' } },
          operatingTips: { type: 'array', items: { type: 'string' } },
          evidenceIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
    dataLimitations: { type: 'array', items: { type: 'string' } },
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
  },
} as const;

@Injectable()
export class OpenAiBusinessLocationRecommendationAgent implements BusinessLocationRecommendationAgentPort {
  constructor(private readonly config: ConfigService) {}

  async generate(
    packet: BusinessLocationEvidencePacket,
  ): Promise<BusinessLocationRecommendationOutput> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const serverUrl = this.config.get<string>('RECOMMENDATION_MCP_SERVER_URL');
    if (!apiKey || !serverUrl) {
      const error = new Error('상권 추천 MCP 에이전트 설정이 필요합니다.');
      error.name = 'RECOMMENDATION_AGENT_NOT_CONFIGURED';
      throw error;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
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
            input: JSON.stringify({ analysisContext: packet.input }),
            tools: [
              {
                type: 'mcp',
                server_label: this.config.get<string>(
                  'RECOMMENDATION_MCP_SERVER_LABEL',
                  'location-recommendation',
                ),
                server_url: serverUrl,
                require_approval: 'never',
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'business_location_recommendation',
                strict: true,
                schema: OUTPUT_SCHEMA,
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
      const body = (await response.json()) as {
        output_text?: unknown;
        output?: unknown;
      };
      const text =
        typeof body.output_text === 'string'
          ? body.output_text
          : this.findText(body.output);
      if (!text)
        throw new Error(
          'OpenAI Responses API의 구조화 출력을 찾을 수 없습니다.',
        );
      return JSON.parse(text) as BusinessLocationRecommendationOutput;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        error.name = 'MODEL_TIMEOUT';
      }
      if (error instanceof Error && error.name === 'SyntaxError')
        error.name = 'INVALID_MODEL_OUTPUT';
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private instructions(): string {
    return '당신은 대한민국 상권 분석 에이전트입니다. 입력의 좌표·업종·영업시간을 사용해 반드시 get_business_location_recommendation_evidence MCP 도구를 호출하세요. 도구가 반환한 후보 상권 안에서만 최대 5개를 순위화하고, 수치·evidenceIds·기준시점을 임의로 만들지 마세요. 점수는 수요 25, 공급기회 20, 고객층 20, 시간대 15, 경쟁건전성 10, 데이터신뢰도 10의 가중합을 사용합니다. 결과는 JSON만 반환하며 성공·수익을 보장하지 않습니다.';
  }

  private findText(value: unknown): string | null {
    if (!Array.isArray(value)) return null;
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (
          part &&
          typeof part === 'object' &&
          typeof (part as { text?: unknown }).text === 'string'
        )
          return (part as { text: string }).text;
      }
    }
    return null;
  }
}
