import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type {
  RecommendationAgentContext,
  RecommendationAgentPort,
} from '../../domain/ports/recommendation-agent.port';
import {
  RecommendationAgentOutput,
  RecommendationEvidencePacket,
} from '../../domain/recommendation.types';

const CODEX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 2_000_000;
const OUTPUT_BEGIN_MARKER = '__CODEX_RECOMMENDATION_OUTPUT_BEGIN__';
const OUTPUT_END_MARKER = '__CODEX_RECOMMENDATION_OUTPUT_END__';

@Injectable()
export class CodexCliRecommendationAgent implements RecommendationAgentPort {
  private readonly logger = new Logger(CodexCliRecommendationAgent.name);

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
        analysisContext: this.toAnalysisContext(packet, context),
      }),
      apiKey,
      context.requestId,
    );
    try {
      return this.parseContainerOutput(output);
    } catch {
      const error = new Error('Codex agent의 JSON 출력이 올바르지 않습니다.');
      error.name = 'INVALID_MODEL_OUTPUT';
      throw error;
    }
  }

  private runContainer(
    input: string,
    apiKey: string,
    requestId: string,
  ): Promise<string> {
    const dockerCommand = this.config.get<string>(
      'CODEX_DOCKER_COMMAND',
      'docker',
    );
    const composeFile = this.config.get<string>(
      'CODEX_AGENT_COMPOSE_FILE',
      'infra/ai/docker-compose.local.yml',
    );
    const model = this.config.get<string>('CODEX_MODEL', 'gpt-5.6-luna');
    const removeContainer =
      this.config.get<string>('CODEX_AGENT_REMOVE_CONTAINER', 'false') ===
      'true';
    const containerName = `recommendation-codex-${requestId}-${randomUUID().slice(0, 8)}`;
    const command = [
      'compose',
      '--env-file',
      '.env',
      '-f',
      composeFile,
      'run',
      '--build',
      '--name',
      containerName,
      ...(removeContainer ? ['--rm'] : []),
      '-T',
      '-e',
      'OPENAI_API_KEY',
      '-e',
      'CODEX_MODEL',
      '-e',
      'CODEX_CA_CERTIFICATE_BASE64',
      'codex-agent',
    ];
    this.logger.log(
      `Starting Codex container ${containerName} for recommendation request ${requestId}.`,
    );
    const child = spawn(dockerCommand, command, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENAI_API_KEY: apiKey,
        CODEX_MODEL: model,
        CODEX_CA_CERTIFICATE_BASE64:
          this.config.get<string>('CODEX_CA_CERTIFICATE_BASE64') ?? '',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

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
        this.logger.log(
          `Codex container ${containerName} completed for recommendation request ${requestId}.`,
        );
        resolve(stdout.trim());
      });
      child.stdin.end(input);
    });
  }

  private parseContainerOutput(output: string): RecommendationAgentOutput {
    const start = output.lastIndexOf(OUTPUT_BEGIN_MARKER);
    const end = output.lastIndexOf(OUTPUT_END_MARKER);
    const json =
      start >= 0 && end > start
        ? output.slice(start + OUTPUT_BEGIN_MARKER.length, end).trim()
        : output.trim();
    return JSON.parse(json) as RecommendationAgentOutput;
  }

  private toAnalysisContext(
    packet: RecommendationEvidencePacket,
    context: RecommendationAgentContext,
  ): Record<string, unknown> {
    return {
      requestId: context.requestId,
      buildingId: context.buildingId,
      building: packet.building,
      commercialAreaLinks: packet.building.commercialAreas.map((area) => ({
        code: area.code,
        name: area.name,
        matchMethod: area.relation === 'DIRECT' ? 'OVERLAP' : 'NEAREST',
        overlapRatio: area.overlapRatio,
        distanceMeters: area.distanceMeters,
      })),
      categoryFeatures: packet.commerce.candidates,
      storeSummary: {
        storeCountWithinRadius: Object.fromEntries(
          packet.commerce.candidates.map((candidate) => [
            candidate.code,
            candidate.nearbyStoreCount,
          ]),
        ),
        totalStoreCountWithinRadius: packet.commerce.totalStoreCount,
      },
      floatingPopulation: packet.population,
      categoryProfiles: packet.profiles,
      analysisRadiusMeters: packet.commerce.radiusMeters,
      statisticsPeriod: {
        categoryFeatures: packet.commerce.sourcePeriod,
        floatingPopulation: packet.population.sourcePeriod,
        categoryProfiles: 'hackathon-v1',
      },
    };
  }
}
