import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ClerkClient, User } from '@clerk/backend';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CLERK_CLIENT } from '../../auth.tokens';
import { Users } from '../../infrastructure/persistence/typeorm/entities/users.entity';

export interface ClerkWebhookUser {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email_addresses?: Array<{ email_address?: string | null }>;
}

@Injectable()
export class CurrentUserService {
  constructor(
    @InjectRepository(Users)
    private readonly users: Repository<Users>,
    @Inject(CLERK_CLIENT)
    private readonly clerkClient: ClerkClient,
  ) {}

  async resolveOrRegister(clerkId: string): Promise<Users> {
    const existing = await this.users.findOne({ where: { clerkId } });
    if (existing?.deletedAt) {
      throw new UnauthorizedException({
        code: 'USER_DEACTIVATED',
        message: '비활성화된 사용자입니다.',
      });
    }
    if (existing) return existing;

    let clerkUser: User;
    try {
      clerkUser = await this.clerkClient.users.getUser(clerkId);
    } catch {
      throw new ServiceUnavailableException({
        code: 'CLERK_USER_LOOKUP_FAILED',
        message: 'Clerk 사용자 정보를 확인할 수 없습니다.',
      });
    }

    await this.users.upsert(
      {
        clerkId,
        name: this.displayName({
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          username: clerkUser.username,
          email: clerkUser.primaryEmailAddress?.emailAddress,
        }),
      },
      ['clerkId'],
    );

    const registered = await this.users.findOne({
      where: { clerkId, deletedAt: IsNull() },
    });
    if (!registered) {
      throw new ServiceUnavailableException({
        code: 'USER_REGISTRATION_FAILED',
        message: '서비스 사용자 등록에 실패했습니다.',
      });
    }
    return registered;
  }

  async syncWebhookUser(payload: ClerkWebhookUser): Promise<Users | null> {
    const existing = await this.users.findOne({
      where: { clerkId: payload.id },
    });
    if (existing?.deletedAt) return existing;

    await this.users.upsert(
      {
        clerkId: payload.id,
        name: this.displayName({
          firstName: payload.first_name,
          lastName: payload.last_name,
          username: payload.username,
          email: payload.email_addresses?.[0]?.email_address,
        }),
      },
      ['clerkId'],
    );
    return this.users.findOne({
      where: { clerkId: payload.id, deletedAt: IsNull() },
    });
  }

  async deactivateByClerkId(clerkId: string): Promise<void> {
    await this.users.update({ clerkId }, { deletedAt: new Date() });
  }

  private displayName(fields: {
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    email?: string | null;
  }): string {
    const candidates = [
      fields.firstName && fields.lastName
        ? `${fields.firstName} ${fields.lastName}`
        : undefined,
      fields.firstName,
      fields.username,
      fields.email?.split('@')[0],
      '사용자',
    ];
    const name = candidates.find((candidate) => candidate?.trim())?.trim();
    return (name || '사용자').slice(0, 20);
  }
}
