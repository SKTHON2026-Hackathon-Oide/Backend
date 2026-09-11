import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { SKIP_RESPONSE_INTERCEPTOR } from '../decorators/skip-response-interceptor.decorator';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept<T>(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ success: true; data: T }> {
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_INTERCEPTOR, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return next.handle() as Observable<{ success: true; data: T }>;
    }
    return next.handle().pipe(map((data: T) => ({ success: true, data })));
  }
}
