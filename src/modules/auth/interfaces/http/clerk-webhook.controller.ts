import { BadRequestException, Controller, Post, Req } from '@nestjs/common';
import { verifyWebhook } from '@clerk/express/webhooks';
import type { WebhookEvent } from '@clerk/backend';
import type { Request } from 'express';
import { CurrentUserService } from '../../application/services/current-user.service';
import type { ClerkWebhookUser } from '../../application/services/current-user.service';

@Controller('webhooks/clerk')
export class ClerkWebhookController {
  constructor(private readonly currentUsers: CurrentUserService) {}

  @Post()
  async handle(@Req() request: Request) {
    let event: WebhookEvent;
    try {
      event = await verifyWebhook(request);
    } catch {
      throw new BadRequestException({
        code: 'INVALID_CLERK_WEBHOOK',
        message: 'Clerk 웹훅 서명을 확인할 수 없습니다.',
      });
    }

    const data = event.data as unknown as {
      id?: unknown;
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
      email_addresses?: Array<{ email_address?: string | null }>;
    };
    if (typeof data.id !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_CLERK_WEBHOOK',
        message: 'Clerk 웹훅 사용자 ID가 없습니다.',
      });
    }

    if (event.type === 'user.deleted') {
      await this.currentUsers.deactivateByClerkId(data.id);
    } else if (event.type === 'user.created' || event.type === 'user.updated') {
      await this.currentUsers.syncWebhookUser(data as ClerkWebhookUser);
    }

    return { received: true };
  }
}
