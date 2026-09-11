import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserPresencePort } from '../../../../domain/ports/user-presence.port';
import { Users } from '../entities/users.entity';

@Injectable()
export class TypeOrmUserPresenceRepository implements UserPresencePort {
  constructor(
    @InjectRepository(Users)
    private readonly repository: Repository<Users>,
  ) {}

  existsActiveUser(userId: string): Promise<boolean> {
    return this.repository.exists({
      where: { id: userId, deletedAt: IsNull() },
    });
  }
}
