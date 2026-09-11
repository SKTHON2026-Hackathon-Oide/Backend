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

    const jobId = `${context.requestId}-${randomUUID()}`;
    const inputKey = `jobs/${jobId}/input.json`;
    const outputKey = `jobs/${jobId}/output.json`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: inputKey,
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
        Body: JSON.stringify({
          analysisContext: this.toAnalysisContext(packet, context),
        }),
      }),
    );

    const taskResult = await this.ecs.send(
      new RunTaskCommand({
        cluster,
        taskDefinition,
        launchType: 'FARGATE',
        startedBy: `skthon-${context.requestId}`.slice(0, 36),
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
    this.logger.log(
      `Started ECS Codex task ${taskArn} for ${context.requestId}.`,
    );

    const timeoutMs = Number(
      this.config.get<string>('ECS_TASK_TIMEOUT_MS', '180000'),
    );
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);
      const described = await this.ecs.send(
        new DescribeTasksCommand({ cluster, tasks: [taskArn] }),
      );
      const task = described.tasks?.[0];
      if (task?.lastStatus !== 'STOPPED') continue;
      const container = task.containers?.find(
        (entry) =>
          entry.name ===
          this.config.get<string>('ECS_TASK_CONTAINER_NAME', 'codex-agent'),
      );
      if (container?.exitCode !== 0) {
        throw this.runnerError(
          container?.reason ?? task.stoppedReason ?? 'Codex task failed.',
        );
      }
      return this.readOutput(bucket, outputKey);
    }

    await this.ecs.send(
      new StopTaskCommand({ cluster, task: taskArn, reason: 'Timed out' }),
    );
    const timeoutError = new Error('Codex agent 호출 시간이 초과되었습니다.');
    timeoutError.name = 'MODEL_TIMEOUT';
    throw timeoutError;
  }

  private async readOutput(
    bucket: string,
    key: string,
  ): Promise<RecommendationAgentOutput> {
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const body = await response.Body?.transformToString();
    if (!body)
      throw this.runnerError('Codex task finished without an output artifact.');
    try {
      return JSON.parse(body) as RecommendationAgentOutput;
    } catch {
      const error = new Error('Codex agent의 JSON 출력이 올바르지 않습니다.');
      error.name = 'INVALID_MODEL_OUTPUT';
      throw error;
    }
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
