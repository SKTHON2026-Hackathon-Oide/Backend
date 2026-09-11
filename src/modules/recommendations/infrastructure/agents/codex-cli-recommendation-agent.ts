import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import type {
  RecommendationAgentContext,
  RecommendationAgentPort,
} from '../../domain/ports/recommendation-agent.port';
import {
  RecommendationAgentOutput,
  RecommendationEvidencePacket,
  SCORE_WEIGHTS,
} from '../../domain/recommendation.types';

const CODEX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 2_000_000;

@Injectable()
export class CodexCliRecommendationAgent implements RecommendationAgentPort {
  constructor(private readonly config: ConfigService) {}

  async generate(
    packet: RecommendationEvidencePacket,
    context?: RecommendationAgentContext,
  ): Promise<RecommendationAgentOutput> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey || !context) {
      const error = new Error(
        'Codex agent는 OPENAI_API_KEY 설정이 필요합니다.',
      );
      error.name = 'RECOMMENDATION_AGENT_NOT_CONFIGURED';
      throw error;
    }

    const output = await this.runContainer(
      JSON.stringify({
        requestId: context.requestId,
        buildingId: context.buildingId,
        evidencePacket: packet,
      }),
      apiKey,
    );
    try {
      return JSON.parse(output) as RecommendationAgentOutput;
    } catch {
      const error = new Error('Codex agent의 JSON 출력이 올바르지 않습니다.');
      error.name = 'INVALID_MODEL_OUTPUT';
      throw error;
    }
  }

  private runContainer(input: string, apiKey: string): Promise<string> {
    const dockerCommand = this.config.get<string>(
      'CODEX_DOCKER_COMMAND',
      'docker',
    );
    const composeFile = this.config.get<string>(
      'CODEX_AGENT_COMPOSE_FILE',
      'infra/ai/docker-compose.local.yml',
    );
    const model = this.config.get<string>('CODEX_MODEL', 'gpt-5.6-luna');
    const child = spawn(
      dockerCommand,
      [
        'compose',
        '--env-file',
        '.env',
        '-f',
        composeFile,
        'run',
        '--rm',
        '-T',
        '-e',
        'OPENAI_API_KEY',
        '-e',
        'CODEX_MODEL',
        'codex-agent',
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OPENAI_API_KEY: apiKey,
          CODEX_MODEL: model,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    return new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, CODEX_TIMEOUT_MS);
      const append = (current: string, chunk: Buffer): string =>
        `${current}${chunk.toString()}`.slice(-MAX_OUTPUT_BYTES);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = append(stdout, chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = append(stderr, chunk);
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        const runnerError = new Error(error.message);
        runnerError.name = 'CODEX_AGENT_RUNNER_ERROR';
        reject(runnerError);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (timedOut) {
          const timeoutError = new Error(
            'Codex agent 호출 시간이 초과되었습니다.',
          );
          timeoutError.name = 'MODEL_TIMEOUT';
          reject(timeoutError);
          return;
        }
        if (code !== 0) {
          const runnerError = new Error(
            stderr.trim() || `Codex agent container exited with ${code}.`,
          );
          runnerError.name = 'CODEX_AGENT_RUNNER_ERROR';
          reject(runnerError);
          return;
        }
        resolve(stdout.trim());
      });
      child.stdin.end(input);
    });
  }

  static instructions(): string {
    return `당신은 서울시 건물 위치 기반 업종 추천 에이전트다.
입력 파일과 MCP 도구가 제공하는 실제 데이터만 사용한다. 반드시
get_location_recommendation_evidence 도구를 requestId와 buildingId로 한 번 이상 호출한다.
후보 업종 집합 안에서 최대 5개를 선택하고, 층·면적·임대료·공실을 알고 있다고 주장하지 않는다.
각 점수는 0~100점이며 총점은 demand ${SCORE_WEIGHTS.demand}, supplyOpportunity ${SCORE_WEIGHTS.supplyOpportunity}, customerFit ${SCORE_WEIGHTS.customerFit}, timeFit ${SCORE_WEIGHTS.timeFit}, competitionHealth ${SCORE_WEIGHTS.competitionHealth}, dataConfidence ${SCORE_WEIGHTS.dataConfidence} 가중합이다.
모든 recommendation의 evidenceIds에는 실제 evidenceId만 넣는다. 최종 응답은 제공된 JSON Schema만 만족하는 JSON이어야 한다.`;
  }
}
