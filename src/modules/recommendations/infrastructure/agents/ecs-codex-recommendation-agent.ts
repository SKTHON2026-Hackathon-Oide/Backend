import {
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
  StopTaskCommand,
} from '@aws-sdk/client-ecs';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  RecommendationAgentContext,
  RecommendationAgentPort,
} from '../../domain/ports/recommendation-agent.port';
import type {
  BusinessLocationEvidencePacket,
  BusinessLocationRecommendationOutput,
} from '../../domain/business-location-recommendation.types';
import {
  RecommendationAgentOutput,
  RecommendationEvidencePacket,
} from '../../domain/recommendation.types';

const POLL_INTERVAL_MS = 2_000;

@Injectable()
export class EcsCodexRecommendationAgent implements RecommendationAgentPort {
  private readonly logger = new Logger(EcsCodexRecommendationAgent.name);
  private readonly ecs: ECSClient;
  private readonly s3: S3Client;

  constructor(private readonly config: ConfigService) {
    const region = config.get<string>('AWS_REGION');
    this.ecs = new ECSClient(region ? { region } : {});
    this.s3 = new S3Client(region ? { region } : {});
  }

  async generate(
    packet: RecommendationEvidencePacket,
    context?: RecommendationAgentContext,
  ): Promise<RecommendationAgentOutput> {
    if (!context)
      throw this.configurationError('Recommendation context is required.');

    return this.runJob<RecommendationAgentOutput>(
      context.requestId,
      {
        analysisContext: this.toAnalysisContext(packet, context),
      },
      null,
    ).catch((error: unknown) => {
      throw this.normalizeRunnerError(error);
    });
  }

  generateBusinessLocation(
    packet: BusinessLocationEvidencePacket,
  ): Promise<BusinessLocationRecommendationOutput> {
    return this.runJob<BusinessLocationRecommendationOutput>(
      packet.input.requestId,
      {
        analysisMode: 'BUSINESS_TO_AREA',
        analysisContext: packet.input,
      },
      'business-location',
    ).catch((error: unknown) => {
      throw this.normalizeRunnerError(error);
    });
  }

  private async runJob<T>(
    requestId: string,
    input: Record<string, unknown>,
    analysisMode: string | null,
  ): Promise<T> {
    const cluster = this.required('ECS_CLUSTER');
    const taskDefinition = this.required('ECS_TASK_DEFINITION_ARN');
    const bucket = this.required('ECS_JOB_BUCKET');
    const subnets = this.csv('ECS_TASK_SUBNET_IDS');
    const securityGroups = this.csv('ECS_TASK_SECURITY_GROUP_IDS');
    const mcpServerUrl = this.required('RECOMMENDATION_MCP_SERVER_URL');
    if (!subnets.length || !securityGroups.length) {
      throw this.configurationError(
        'ECS task subnet and security group are required.',
      );
    }

    const jobId = `${requestId}-${randomUUID()}`;
    const inputKey = `jobs/${jobId}/input.json`;
    const outputKey = `jobs/${jobId}/output.json`;
    await this.withRetry(() =>
      this.s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: inputKey,
          ContentType: 'application/json',
          ServerSideEncryption: 'AES256',
          Body: JSON.stringify(input),
        }),
      ),
    );

    const taskResult = await this.ecs.send(
      new RunTaskCommand({
        cluster,
        taskDefinition,
        launchType: 'FARGATE',
        startedBy: `skthon-${requestId}`.slice(0, 36),
        networkConfiguration: {
          awsvpcConfiguration: {
            assignPublicIp: 'ENABLED',
            subnets,
            securityGroups,
          },
        },
        overrides: {
          containerOverrides: [
            {
              name: this.config.get<string>(
                'ECS_TASK_CONTAINER_NAME',
                'codex-agent',
              ),
              environment: [
                { name: 'INPUT_S3_URI', value: `s3://${bucket}/${inputKey}` },
                { name: 'OUTPUT_S3_URI', value: `s3://${bucket}/${outputKey}` },
                { name: 'MCP_SERVER_URL', value: mcpServerUrl },
                ...(analysisMode
                  ? [
                      {
                        name: 'RECOMMENDATION_ANALYSIS_MODE',
                        value: analysisMode,
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
      }),
    );
    const failure = taskResult.failures?.[0];
    const taskArn = taskResult.tasks?.[0]?.taskArn;
    if (failure || !taskArn) {
      throw this.runnerError(
        failure?.reason ?? 'ECS task could not be started.',
      );
    }
    this.logger.log(`Started ECS Codex task ${taskArn} for ${requestId}.`);

    const timeoutMs = Number(
      this.config.get<string>('ECS_TASK_TIMEOUT_MS', '300000'),
    );
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);
      const described = await this.withRetry(() =>
        this.ecs.send(new DescribeTasksCommand({ cluster, tasks: [taskArn] })),
      );
      const task = described.tasks?.[0];
      if (task?.lastStatus !== 'STOPPED') continue;
      const container = task.containers?.find(
        (entry) =>
          entry.name ===
          this.config.get<string>('ECS_TASK_CONTAINER_NAME', 'codex-agent'),
      );
      if (!container) {
        throw this.runnerError('Codex task container state was not returned.');
      }
      if (container.exitCode !== 0) {
        throw this.runnerError(
          container.reason ?? task.stoppedReason ?? 'Codex task failed.',
        );
      }
      return this.readOutput<T>(bucket, outputKey);
    }

    try {
      return await this.readOutput<T>(bucket, outputKey, 2);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== 'AGENT_RESULT_NOT_AVAILABLE'
      ) {
        throw error;
      }
    }
    await this.ecs
      .send(
        new StopTaskCommand({ cluster, task: taskArn, reason: 'Timed out' }),
      )
      .catch((error: unknown) =>
        this.logger.warn(
          `Failed to stop timed-out ECS task ${taskArn}: ${this.errorMessage(error)}`,
        ),
      );
    const timeoutError = new Error('Codex agent 호출 시간이 초과되었습니다.');
    timeoutError.name = 'MODEL_TIMEOUT';
    throw timeoutError;
  }

  private async readOutput<T>(
    bucket: string,
    key: string,
    attempts = Number(this.config.get<string>('ECS_RESULT_READ_ATTEMPTS', '5')),
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        const body = await response.Body?.transformToString();
        if (!body) throw new Error('Empty output artifact.');
        try {
          return JSON.parse(body) as T;
        } catch {
          const error = new Error(
            'Codex agent의 JSON 출력이 올바르지 않습니다.',
          );
          error.name = 'INVALID_MODEL_OUTPUT';
          throw error;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'INVALID_MODEL_OUTPUT') {
          throw error;
        }
        lastError = error;
        if (attempt < attempts) {
          await this.sleep(
            Number(this.config.get<string>('ECS_RESULT_READ_DELAY_MS', '750')) *
              attempt,
          );
        }
      }
    }
    const error = new Error(
      `Codex task output artifact is not available: ${this.errorMessage(lastError)}`,
    );
    error.name = 'AGENT_RESULT_NOT_AVAILABLE';
    throw error;
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < 3) await this.sleep(POLL_INTERVAL_MS / 2);
      }
    }
    throw lastError;
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

  private required(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value)
      throw this.configurationError(`${name} is required for the ECS runner.`);
    return value;
  }

  private csv(name: string): string[] {
    return (this.config.get<string>(name) ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private configurationError(message: string): Error {
    const error = new Error(message);
    error.name = 'RECOMMENDATION_AGENT_NOT_CONFIGURED';
    return error;
  }

  private runnerError(message: string): Error {
    const error = new Error(message);
    error.name = 'CODEX_AGENT_RUNNER_ERROR';
    return error;
  }

  private normalizeRunnerError(error: unknown): Error {
    if (
      error instanceof Error &&
      [
        'MODEL_TIMEOUT',
        'CODEX_AGENT_RUNNER_ERROR',
        'AGENT_RESULT_NOT_AVAILABLE',
        'INVALID_MODEL_OUTPUT',
        'RECOMMENDATION_AGENT_NOT_CONFIGURED',
      ].includes(error.name)
    ) {
      return error;
    }
    return this.runnerError(this.errorMessage(error));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
