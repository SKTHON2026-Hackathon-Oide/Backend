import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ExpressRequestWithAuth, getAuth } from '@clerk/express';
import type { SessionAuthObject } from '@clerk/backend';
import { CurrentUserService } from '../../application/services/current-user.service';
import { AuthenticatedRequest } from './authenticated-user';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(private readonly currentUsers: CurrentUserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & ExpressRequestWithAuth>();
    let auth: SessionAuthObject;
    try {
      auth = getAuth(request, { acceptsToken: 'session_token' });
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Clerk 인증 미들웨어가 구성되지 않았습니다.',
      });
    }

    if (!auth.isAuthenticated || !auth.userId) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: '유효한 Clerk 세션이 필요합니다.',
      });
    }

    const user = await this.currentUsers.resolveOrRegister(auth.userId);
    request.currentUser = {
      clerkId: auth.userId,
      internalUserId: user.id,
    };
    return true;
  }
}
