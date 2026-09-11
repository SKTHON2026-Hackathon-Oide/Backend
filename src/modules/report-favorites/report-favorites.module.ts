import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
} from 'class-validator';
import { DataSource } from 'typeorm';
import { AuthModule } from '../auth/auth.module';
import { ClerkAuthGuard } from '../auth/interfaces/http/clerk-auth.guard';
import { CurrentUser } from '../auth/interfaces/http/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/http/authenticated-user';

export class SaveReportFavoriteDto {
  @IsString() @IsNotEmpty() @MaxLength(512) id: string;
  @IsIn(['vacancy', 'location']) kind: string;
  @IsString() @MaxLength(1000) title: string;
  @IsOptional() @IsString() @MaxLength(1000) address?: string;
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  @IsOptional() @IsString() @MaxLength(10000) summary?: string;
  @IsOptional() @IsNumber() score?: number;
  @IsObject() report: Record<string, unknown>;
}

type FavoriteRow = {
  summary: Record<string, unknown>;
  report?: Record<string, unknown>;
  savedAt: Date;
};

@Injectable()
export class ReportFavoritesService {
  constructor(private readonly database: DataSource) {}

  async list(userId: string) {
    const rows: FavoriteRow[] = await this.database.query(
      'SELECT summary, saved_at AS "savedAt" FROM report_favorite WHERE user_id = $1 ORDER BY saved_at DESC',
      [userId],
    );
    return rows.map((row) => ({
      ...row.summary,
      savedAt: row.savedAt,
      hasReport: true,
    }));
  }

  async get(userId: string, id: string) {
    const rows: FavoriteRow[] = await this.database.query(
      'SELECT summary, report, saved_at AS "savedAt" FROM report_favorite WHERE user_id = $1 AND favorite_id = $2',
      [userId, id],
    );
    if (!rows[0])
      throw new NotFoundException('저장된 레포트를 찾을 수 없습니다.');
    return {
      ...rows[0].summary,
      report: rows[0].report,
      savedAt: rows[0].savedAt,
      hasReport: true,
    };
  }

  async save(userId: string, input: SaveReportFavoriteDto) {
    const { report, ...summary } = input;
    const serialized = JSON.stringify(report);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > 3 * 1024 * 1024)
      throw new PayloadTooLargeException(
        '레포트는 한 건당 최대 3MB까지 저장할 수 있습니다.',
      );
    const rows: FavoriteRow[] = await this.database.query(
      `INSERT INTO report_favorite (user_id, favorite_id, summary, report, report_bytes)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
       ON CONFLICT (user_id, favorite_id) DO UPDATE SET summary = EXCLUDED.summary, report = EXCLUDED.report, report_bytes = EXCLUDED.report_bytes
       RETURNING summary, saved_at AS "savedAt"`,
      [userId, input.id, JSON.stringify(summary), serialized, bytes],
    );
    return { ...rows[0].summary, savedAt: rows[0].savedAt, hasReport: true };
  }

  async remove(userId: string, id: string) {
    await this.database.query(
      'DELETE FROM report_favorite WHERE user_id = $1 AND favorite_id = $2',
      [userId, id],
    );
    return { id, deleted: true };
  }
}

@ApiTags('report-favorites')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('v1/report-favorites')
export class ReportFavoritesController {
  constructor(private readonly favorites: ReportFavoritesService) {}
  @Get()
  @ApiOperation({ summary: '내 찜 레포트 목록 (본문 제외)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.favorites.list(user.internalUserId);
  }
  @Get(':id')
  @ApiOperation({ summary: '내 찜 레포트 다시 보기' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.favorites.get(user.internalUserId, id);
  }
  @Put()
  @ApiOperation({ summary: '레포트 찜 저장 (본문 최대 3MB)' })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: SaveReportFavoriteDto,
  ) {
    return this.favorites.save(user.internalUserId, input);
  }
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.favorites.remove(user.internalUserId, id);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [ReportFavoritesController],
  providers: [ReportFavoritesService],
})
export class ReportFavoritesModule {}
