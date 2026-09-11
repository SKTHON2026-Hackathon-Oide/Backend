import {
  Body,
  Controller,
  HttpException,
  Param,
  ParseUUIDPipe,
  Put,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../../../auth/interfaces/http/clerk-auth.guard';
import type { AuthenticatedUser } from '../../../auth/interfaces/http/authenticated-user';
import { CurrentUser } from '../../../auth/interfaces/http/current-user.decorator';
import { CreateSpaceAnalysisContextUseCase } from '../../applications/usecases/create-space-analysis-context.usecase';
import { SelectAnalysisBuildingUseCase } from '../../applications/usecases/select-analysis-building.usecase';
import { SpaceAnalysisContextError } from '../../domain/services/space-analysis-context.error';
import { CreateSpaceAnalysisContextDto } from './dto/create-space-analysis-context.dto';
import { SelectAnalysisBuildingDto } from './dto/select-analysis-building.dto';
import { SelectSpaceDetailDto } from './dto/select-space-detail.dto';
import { SelectSpaceDetailUseCase } from '../../applications/usecases/select-space-detail.usecase';

@ApiTags('space-analysis')
@ApiBearerAuth()
@Controller('v1/space-analysis-contexts')
@UseGuards(ClerkAuthGuard)
export class SpaceAnalysisContextController {
  constructor(
    private readonly createContext: CreateSpaceAnalysisContextUseCase,
    private readonly selectBuilding: SelectAnalysisBuildingUseCase,
    private readonly selectSpaceDetail: SelectSpaceDetailUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: '좌표로 공간 분석 컨텍스트 생성' })
  @ApiResponse({ status: 201, description: '건물 후보가 포함된 컨텍스트 생성' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateSpaceAnalysisContextDto,
  ) {
    try {
      return await this.createContext.execute({
        userId: user.internalUserId,
        longitude: body.longitude,
        latitude: body.latitude,
      });
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Put(':contextId/building')
  @ApiOperation({ summary: '공간 분석 대상 건물 선택' })
  @ApiResponse({ status: 200, description: '선택된 건물과 컨텍스트 상태 반환' })
  async select(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contextId', new ParseUUIDPipe()) contextId: string,
    @Body() body: SelectAnalysisBuildingDto,
  ) {
    try {
      return await this.selectBuilding.execute({
        userId: user.internalUserId,
        contextId,
        buildingId: body.buildingId,
        spaceOptionsPage: body.spaceOptionsPage,
        spaceOptionsPageSize: body.spaceOptionsPageSize,
      });
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Put(':contextId/space-detail')
  @ApiOperation({ summary: '건축물대장 옵션 또는 수동 공간 세부정보 선택' })
  async selectDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contextId', new ParseUUIDPipe()) contextId: string,
    @Body() body: SelectSpaceDetailDto,
  ) {
    try {
      return await this.selectSpaceDetail.execute({
        ...body,
        userId: user.internalUserId,
        contextId,
      });
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Put(':contextId/space-detail/skip')
  @ApiOperation({ summary: '공간 세부정보를 건너뛰고 위치 기반 분석 준비' })
  async skipDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contextId', new ParseUUIDPipe()) contextId: string,
  ) {
    try {
      return await this.selectSpaceDetail.skip(contextId, user.internalUserId);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private toHttpException(error: unknown): HttpException {
    if (error instanceof SpaceAnalysisContextError) {
      return new HttpException(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    return error instanceof HttpException
      ? error
      : new HttpException(
          {
            code: 'INTERNAL_SERVER_ERROR',
            message: '요청 처리 중 오류가 발생했습니다.',
          },
          500,
        );
  }
}
