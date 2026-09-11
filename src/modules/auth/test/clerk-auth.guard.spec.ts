import { UnauthorizedException } from '@nestjs/common';
import { getAuth } from '@clerk/express';
import type { CurrentUserService } from '../application/services/current-user.service';
import { ClerkAuthGuard } from '../interfaces/http/clerk-auth.guard';

jest.mock('@clerk/express', () => ({
  getAuth: jest.fn(),
}));

const mockedGetAuth = jest.mocked(getAuth);

describe('ClerkAuthGuard', () => {
  const resolveOrRegister = jest.fn();
  const currentUserService = {
    resolveOrRegister,
  } as unknown as CurrentUserService;
  const guard = new ClerkAuthGuard(currentUserService);
  const request = {} as Record<string, unknown>;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    delete request.currentUser;
  });

  it('rejects requests without an authenticated Clerk session', async () => {
    mockedGetAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    } as never);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(resolveOrRegister).not.toHaveBeenCalled();
  });

  it('attaches the verified Clerk ID and internal ID to the request', async () => {
    mockedGetAuth.mockReturnValue({
      isAuthenticated: true,
      userId: 'user_123',
    } as never);
    resolveOrRegister.mockResolvedValue({ id: '7' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(resolveOrRegister).toHaveBeenCalledWith('user_123');
    expect(request.currentUser).toEqual({
      clerkId: 'user_123',
      internalUserId: '7',
    });
  });
});
