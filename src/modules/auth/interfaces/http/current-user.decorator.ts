import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from './authenticated-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.currentUser) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Clerk 인증이 필요합니다.',
      });
    }
    return request.currentUser;
  },
);
