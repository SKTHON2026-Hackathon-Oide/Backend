import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../../auth/interfaces/http/clerk-auth.guard';
import { ResolveAdministrativeAreaService } from '../../applications/resolve-administrative-area.service';
import { ResolveAdministrativeAreaDto } from './dto/resolve-administrative-area.dto';

@ApiTags('administrative-areas')
@ApiBearerAuth()
@Controller('v1/administrative-areas')
@UseGuards(ClerkAuthGuard)
export class AdministrativeAreaController {
  constructor(private readonly resolver: ResolveAdministrativeAreaService) {}

  @Post('resolve')
  @ApiOperation({ summary: '위도·경도를 내부 행정구역 코드로 변환' })
  resolve(@Body() body: ResolveAdministrativeAreaDto) {
    return this.resolver.resolve(body.longitude, body.latitude);
  }
}
