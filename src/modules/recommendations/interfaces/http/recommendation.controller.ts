import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  HttpCode,
  Param,
  Post,
  Sse,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { SkipResponseInterceptor } from '../../../common/decorators/skip-response-interceptor.decorator';
import { RecommendationFlowError } from '../../applications/services/recommendation-flow.error';
import { RecommendationOrchestratorService } from '../../applications/services/recommendation-orchestrator.service';
import { RecommendationStreamService } from '../../applications/services/recommendation-stream.service';
import { CreateRecommendationRequestDto } from './dto/create-recommendation-request.dto';

@ApiTags('recommendations')
@ApiHeader({
  name: 'X-User-Id',
  required: true,
  description: '현재 인증 사용자의 내부 users.id',
})
@Controller('v1')
export class RecommendationController {
  constructor(
    private readonly orchestrator: RecommendationOrchestratorService,
    private readonly streamService: RecommendationStreamService,
  ) {}

  @Post('buildings/:buildingId/recommendation-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '건물 위치 기반 비동기 업종 추천 분석 요청' })
  async create(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('buildingId') buildingId: string,
    @Body() body: CreateRecommendationRequestDto,
  ): Promise<Record<string, unknown>> {
    const userId = this.parsePositiveInteger(userIdHeader, 'X-User-Id');
    this.validateId(buildingId, 'buildingId');
    try {
      return await this.orchestrator.create(
        userId,
        buildingId,
        idempotencyKey,
        body.userPreference,
      );
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Get('recommendation-requests/:requestId')
  @ApiOperation({ summary: '추천 분석 요청 상태·결과 조회' })
  async get(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Param('requestId') requestId: string,
  ): Promise<Record<string, unknown>> {
    const userId = this.parsePositiveInteger(userIdHeader, 'X-User-Id');
    this.validateId(requestId, 'requestId');
    try {
      return await this.orchestrator.getOwned(requestId, userId);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Sse('recommendation-requests/:requestId/events')
  @SkipResponseInterceptor()
  @ApiProduces('text/event-stream')
  @ApiOperation({ summary: '추천 분석 진행 상황 SSE 스트림' })
  stream(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Param('requestId') requestId: string,
  ): Observable<MessageEvent> {
    const userId = this.parsePositiveInteger(userIdHeader, 'X-User-Id');
    this.validateId(requestId, 'requestId');
    const afterId =
      lastEventId && /^\d+$/.test(lastEventId) ? lastEventId : '0';
    return new Observable<MessageEvent>((subscriber) => {
      void this.orchestrator
        .assertOwned(requestId, userId)
        .then(() => {
          const subscription = this.streamService
            .stream(requestId, afterId)
            .subscribe(subscriber);
          subscriber.add(subscription);
        })
        .catch((error: unknown) =>
          subscriber.error(this.toHttpException(error)),
        );
    });
  }

  private parsePositiveInteger(
    value: string | undefined,
    field: string,
  ): string {
    if (!value || !/^[1-9]\d*$/.test(value)) {
      throw new BadRequestException(`${field}는 양의 정수여야 합니다.`);
    }
    return value;
  }

  private validateId(value: string, field: string): void {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new BadRequestException(`${field}는 양의 정수여야 합니다.`);
    }
  }

  private toHttpException(error: unknown): HttpException {
    if (error instanceof RecommendationFlowError) {
      return new HttpException(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    if (error instanceof HttpException) return error;
    return new HttpException(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: '추천 분석 요청 처리 중 오류가 발생했습니다.',
      },
      500,
    );
  }
}
