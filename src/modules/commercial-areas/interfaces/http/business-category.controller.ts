import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClerkAuthGuard } from '../../../auth/interfaces/http/clerk-auth.guard';
import { BusinessCategory } from '../../infrastructure/persistence/typeorm/entities/business-category.entity';

@ApiTags('business-categories')
@ApiBearerAuth()
@Controller('v1/business-categories')
@UseGuards(ClerkAuthGuard)
export class BusinessCategoryController {
  constructor(
    @InjectRepository(BusinessCategory)
    private readonly repository: Repository<BusinessCategory>,
  ) {}

  @Get()
  @ApiOperation({ summary: '분석 가능한 희망 업종 목록 조회' })
  @ApiQuery({ name: 'analysisSupported', required: false, type: Boolean })
  @ApiQuery({ name: 'q', required: false, type: String })
  async list(
    @Query('analysisSupported') analysisSupported?: string,
    @Query('q') query?: string,
  ) {
    const qb = this.repository
      .createQueryBuilder('category')
      .select([
        'category.code',
        'category.name',
        'category.categoryGroup',
        'category.isSalesSupported',
      ])
      .orderBy('category.categoryGroup', 'ASC', 'NULLS LAST')
      .addOrderBy('category.name', 'ASC');
    if (analysisSupported !== 'false')
      qb.andWhere('category.isSalesSupported = :supported', {
        supported: true,
      });
    if (query?.trim())
      qb.andWhere(
        '(category.name ILIKE :query OR category.code ILIKE :query)',
        { query: `%${query.trim()}%` },
      );
    const rows = await qb.getMany();
    return {
      categories: rows.map((row) => ({
        code: row.code,
        name: row.name,
        categoryGroup: row.categoryGroup,
      })),
    };
  }
}
