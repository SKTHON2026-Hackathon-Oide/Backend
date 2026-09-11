import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../auth/interfaces/http/authenticated-user';
import { ClerkAuthGuard } from '../../../auth/interfaces/http/clerk-auth.guard';
import { CurrentUser } from '../../../auth/interfaces/http/current-user.decorator';
import { RecommendationFlowError } from '../../applications/services/recommendation-flow.error';
import { BusinessLocationRecommendationOrchestratorService } from '../../applications/services/business-location-recommendation-orchestrator.service';
import { CreateBusinessLocationRecommendationRequestDto } from './dto/create-business-location-recommendation-request.dto';

@ApiTags('business-location-recommendations')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(ClerkAuthGuard)
export class BusinessLocationRecommendationController {
  constructor(
    private readonly orchestrator: BusinessLocationRecommendationOrchestratorService,
  ) {}

  @Post('business-location-recommendation-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '희망 업종·선호지역·영업시간 기반 상권 추천 요청' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateBusinessLocationRecommendationRequestDto,
  ) {
    try {
      return await this.orchestrator.create(
        user.internalUserId,
        body,
        idempotencyKey,
      );
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  private toHttp(error: unknown): HttpException {
    if (error instanceof RecommendationFlowError)
      return new HttpException(
        { code: error.code, message: error.message },
        error.status,
      );
    if (error instanceof HttpException) return error;
    return new HttpException(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: '상권 추천 요청 처리 중 오류가 발생했습니다.',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
