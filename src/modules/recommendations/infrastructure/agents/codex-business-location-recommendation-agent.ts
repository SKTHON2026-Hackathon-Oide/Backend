import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type {
  BusinessLocationEvidencePacket,
  BusinessLocationRecommendationOutput,
} from '../../domain/business-location-recommendation.types';
import type { BusinessLocationRecommendationAgentPort } from '../../domain/ports/business-location-recommendation-agent.port';

const BEGIN = '__CODEX_RECOMMENDATION_OUTPUT_BEGIN__';
const END = '__CODEX_RECOMMENDATION_OUTPUT_END__';

@Injectable()
export class CodexBusinessLocationRecommendationAgent implements BusinessLocationRecommendationAgentPort {
  private readonly logger = new Logger(
    CodexBusinessLocationRecommendationAgent.name,
  );
  constructor(private readonly config: ConfigService) {}

  async generate(
    packet: BusinessLocationEvidencePacket,
  ): Promise<BusinessLocationRecommendationOutput> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      const error = new Error(
        'Codex agent는 OPENAI_API_KEY 설정이 필요합니다.',
      );
      error.name = 'RECOMMENDATION_AGENT_NOT_CONFIGURED';
      throw error;
    }
    const command = this.config.get<string>('CODEX_DOCKER_COMMAND', 'docker');
    const composeFile = this.config.get<string>(
      'CODEX_AGENT_COMPOSE_FILE',
      'infra/ai/docker-compose.local.yml',
    );
    const containerName = `business-location-codex-${packet.input.requestId}-${randomUUID().slice(0, 8)}`;
    const remove =
      this.config.get<string>('CODEX_AGENT_REMOVE_CONTAINER', 'false') ===
      'true';
    const args = [
      'compose',
      '--env-file',
      '.env',
      '-f',
      composeFile,
      'run',
      '--build',
      '--name',
      containerName,
      ...(remove ? ['--rm'] : []),
      '-T',
      '-e',
      'OPENAI_API_KEY',
      '-e',
      'CODEX_MODEL',
      '-e',
      'CODEX_CA_CERTIFICATE_BASE64',
      '-e',
      'RECOMMENDATION_ANALYSIS_MODE',
      'codex-agent',
    ];
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENAI_API_KEY: apiKey,
        CODEX_MODEL: this.config.get<string>('CODEX_MODEL', 'gpt-5.6-luna'),
        CODEX_CA_CERTIFICATE_BASE64:
          this.config.get<string>('CODEX_CA_CERTIFICATE_BASE64') ?? '',
        RECOMMENDATION_ANALYSIS_MODE: 'business-location',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, 120_000);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = `${stdout}${chunk.toString()}`.slice(-2_000_000);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-2_000_000);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        error.name = 'CODEX_AGENT_RUNNER_ERROR';
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          const error = new Error('Codex agent 호출 시간이 초과되었습니다.');
          error.name = 'MODEL_TIMEOUT';
          reject(error);
          return;
        }
        if (code !== 0) {
          const error = new Error(
            stderr.trim() || `Codex agent exited with ${code}.`,
          );
          error.name = 'CODEX_AGENT_RUNNER_ERROR';
          reject(error);
          return;
        }
        const start = stdout.lastIndexOf(BEGIN);
        const end = stdout.lastIndexOf(END);
        const json =
          start >= 0 && end > start
            ? stdout.slice(start + BEGIN.length, end).trim()
            : stdout.trim();
        try {
          resolve(JSON.parse(json) as BusinessLocationRecommendationOutput);
        } catch {
          const error = new Error(
            'Codex agent의 JSON 출력이 올바르지 않습니다.',
          );
          error.name = 'INVALID_MODEL_OUTPUT';
          reject(error);
        }
      });
      child.stdin.end(
        JSON.stringify({
          analysisMode: 'BUSINESS_TO_AREA',
          analysisContext: packet.input,
        }),
      );
    });
  }
}
