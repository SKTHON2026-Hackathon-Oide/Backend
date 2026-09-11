import { Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from './authenticated-user';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { CurrentUser } from './current-user.decorator';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('v1/auth')
@UseGuards(ClerkAuthGuard)
export class AuthController {
  @Put('register')
  @ApiOperation({ summary: '현재 Clerk 사용자를 내부 users에 등록' })
  register(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.internalUserId,
      clerkId: user.clerkId,
      registered: true,
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'Clerk 세션과 연결된 내부 사용자 조회' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.internalUserId,
      clerkId: user.clerkId,
    };
  }
}
