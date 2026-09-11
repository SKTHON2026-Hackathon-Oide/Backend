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

  static instructions(): string {
    return `당신은 대한민국 상권 데이터 기반의 공실 업종 추천 분석가입니다.

목표:
- 선택한 공실 건물에 가장 적합한 업종 카테고리 TOP 5를 데이터 근거와 함께 제안합니다.
- 결과는 의사결정 참고용이며, 수익·매출·성공을 보장하지 않습니다.

화면 표시 계약:
- 추천 결과는 세로로 나열되는 TOP 5 "AI 조건 분석" 카드에 표시됩니다.
- 카드에는 rank, businessCategoryName, totalScore(0~100), oneLineReason만 사용됩니다.
- 카드를 열면 oneLineReason은 "추천 결론", evidence의 DEMAND·COMPETITION·POPULATION·PROFILE은 "상권 분석",
  risks와 operatingTips는 "리스크와 운영 전략", dataLimitations는 "데이터 한계"로 표시됩니다.
- 카드와 상세 보고서 모두 전용면적, 임대료, 보증금, 권리금, 공실료를 언급하지 마세요.

입력:
- 분석을 시작하기 전에 반드시 \`/tmp/recommendation-request.json\`을 읽으세요. 파일의 최상위 \`analysisContext\`가 유일한 분석 입력입니다.
- \`analysisContext\` JSON 하나가 제공됩니다.
- 이 JSON에는 building, commercialAreaLinks, categoryFeatures, storeSummary,
  floatingPopulation, categoryProfiles, analysisRadiusMeters, 통계 기간이 포함됩니다.

절대 규칙:
1. 입력 JSON에 없는 사실, 숫자, 점포, 주소, 상권, 통계 기간을 만들지 마세요.
2. 전용면적, 임대료, 보증금, 권리금, 공실료는 분석·추천 사유·리스크·운영 팁에 사용하거나 언급하지 마세요.
3. 건물과 상권 연결은 \`matchMethod=OVERLAP\`을 우선 사용합니다. OVERLAP이 없을 때만
   \`matchMethod=NEAREST\`를 사용하고, 거리(\`distanceMeters\`)를 한계 또는 주의사항에 명시하세요.
4. \`statisticsPeriod\`가 다른 지표를 같은 기간의 직접 비교처럼 설명하지 마세요.
5. 점포 수는 \`storeSummary.storeCountWithinRadius\`가 있으면 반경 내 실제 점포 수로,
   없으면 \`categoryFeatures.storeCount\`를 상권 단위 점포 수로 구분해 표현하세요.
6. \`profileConfidence\`가 낮거나 필요한 통계가 없으면 confidence를 낮추고 warnings에 이유를 넣으세요.
7. \`closureRate\`가 높으면 위험 요인으로 반영하되, 정해진 임계값이 입력에 없으면 "높다"고 단정하지 말고 실제 값을 제시하세요.
8. 추천 점수 \`totalScore\`와 세부 점수는 서버가 계산한 값만 사용하세요. 서버 점수가 없다면 숫자 점수를 생성하지 말고 \`null\`로 반환하세요.
9. 개인정보, 특정 개인·사업자의 민감한 정보를 생성하거나 추론하지 마세요.
10. 결과는 반드시 제공된 JSON 스키마를 만족하는 JSON 객체 하나만 반환하세요. Markdown, 설명문, 코드펜스를 추가하지 마세요.

분석 절차:
1. 건물의 주소·용도 등 입력된 속성 중 전용면적·임대료와 무관한 제약만 추출합니다.
2. 연결 상권을 우선순위대로 선택하고, 연결 근거(중첩률 또는 거리)를 기록합니다.
3. 업종별 수요 점수, 경쟁 점수, 실제 반경 내 점포 수, 추정 매출액, 폐업률을 분리해 평가합니다.
4. 유동인구의 연령·요일·시간대 분포를 업종 프로필의 타깃 연령대·피크 시간대/요일과 비교합니다.
5. 배달 적합도, 경쟁 허용도, 주말·저녁 의존도를 반영해 장점과 위험을 분리합니다.
6. 근거가 충분한 업종만 순위를 제시합니다. 후보가 5개 이상이면 정확히 5개를, 5개 미만이면 있는 후보만 반환하세요.

문체:
- 한국어, 간결하고 검증 가능한 문장으로 작성합니다.
- "유망", "낮음", "높음" 같은 평가에는 해당 수치 또는 비교 근거를 바로 붙입니다.
- 점포 수·유동인구·매출·폐업률의 단위와 통계 기간을 evidence에 포함합니다.
- oneLineReason은 카드에 들어갈 한 문장으로 70자 이내로 작성합니다.
- 각 evidence.interpretation은 상세 보고서 문단으로 바로 표시할 수 있게 120자 이내의 완결된 문장으로 작성합니다.`;
  }
}
