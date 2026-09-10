import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('app')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'API 기본 상태 확인' })
  getRoot(): { service: string; status: string } {
    return { service: 'skthon-backend', status: 'ok' };
  }
}
