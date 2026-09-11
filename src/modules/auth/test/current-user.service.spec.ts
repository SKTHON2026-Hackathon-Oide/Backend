import { UnauthorizedException } from '@nestjs/common';
import type { ClerkClient, User } from '@clerk/backend';
import { CurrentUserService } from '../application/services/current-user.service';
import { Users } from '../infrastructure/persistence/typeorm/entities/users.entity';

type UserRepositoryStub = {
  findOne: jest.Mock;
  upsert: jest.Mock;
};

const clerkUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user_123',
    firstName: '길동',
    lastName: '홍',
    username: null,
    primaryEmailAddress: { emailAddress: 'gildong@example.com' },
    ...overrides,
  }) as User;

describe('CurrentUserService', () => {
  let repository: UserRepositoryStub;
  let clerkClient: { users: { getUser: jest.Mock } };
  let service: CurrentUserService;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      upsert: jest.fn(),
    };
    clerkClient = { users: { getUser: jest.fn() } };
    service = new CurrentUserService(
      repository as unknown as never,
      clerkClient as unknown as ClerkClient,
    );
  });

  it('returns an existing active user without calling Clerk', async () => {
    const existing = { id: '7', clerkId: 'user_123', deletedAt: null } as Users;
    repository.findOne.mockResolvedValue(existing);

    await expect(service.resolveOrRegister('user_123')).resolves.toBe(existing);
    expect(clerkClient.users.getUser).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('creates the local user on the first authenticated request', async () => {
    const registered = {
      id: '7',
      clerkId: 'user_123',
      name: '길동 홍',
      deletedAt: null,
    } as Users;
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(registered);
    clerkClient.users.getUser.mockResolvedValue(clerkUser());

    await expect(service.resolveOrRegister('user_123')).resolves.toBe(
      registered,
    );
    expect(repository.upsert).toHaveBeenCalledWith(
      { clerkId: 'user_123', name: '길동 홍' },
      ['clerkId'],
    );
  });

  it('never reactivates a locally deactivated user', async () => {
    repository.findOne.mockResolvedValue({
      id: '7',
      clerkId: 'user_123',
      deletedAt: new Date(),
    });

    await expect(service.resolveOrRegister('user_123')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(clerkClient.users.getUser).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('uses a safe fallback when Clerk has no display name', async () => {
    const registered = {
      id: '7',
      clerkId: 'user_123',
      deletedAt: null,
    } as Users;
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(registered);
    clerkClient.users.getUser.mockResolvedValue(
      clerkUser({ firstName: null, lastName: null, username: null }),
    );

    await service.resolveOrRegister('user_123');
    expect(repository.upsert).toHaveBeenCalledWith(
      { clerkId: 'user_123', name: 'gildong' },
      ['clerkId'],
    );
  });
});
