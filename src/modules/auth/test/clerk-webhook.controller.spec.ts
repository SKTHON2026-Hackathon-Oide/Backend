import { BadRequestException } from '@nestjs/common';
import { verifyWebhook } from '@clerk/express/webhooks';
import { ClerkWebhookController } from '../interfaces/http/clerk-webhook.controller';

jest.mock('@clerk/express/webhooks', () => ({
  verifyWebhook: jest.fn(),
}));

const mockedVerifyWebhook = jest.mocked(verifyWebhook);

describe('ClerkWebhookController', () => {
  const currentUsers = {
    syncWebhookUser: jest.fn(),
    deactivateByClerkId: jest.fn(),
  };
  const controller = new ClerkWebhookController(currentUsers as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects an invalid webhook signature', async () => {
    mockedVerifyWebhook.mockRejectedValue(new Error('invalid signature'));

    await expect(controller.handle({} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(currentUsers.syncWebhookUser).not.toHaveBeenCalled();
  });

  it('syncs user.created events idempotently through the user service', async () => {
    mockedVerifyWebhook.mockResolvedValue({
      type: 'user.created',
      data: {
        id: 'user_123',
        first_name: '길동',
        last_name: '홍',
      },
    } as never);

    await expect(controller.handle({} as never)).resolves.toEqual({
      received: true,
    });
    expect(currentUsers.syncWebhookUser).toHaveBeenCalledWith({
      id: 'user_123',
      first_name: '길동',
      last_name: '홍',
    });
  });

  it('soft-deactivates users on user.deleted events', async () => {
    mockedVerifyWebhook.mockResolvedValue({
      type: 'user.deleted',
      data: { id: 'user_123' },
    } as never);

    await controller.handle({} as never);
    expect(currentUsers.deactivateByClerkId).toHaveBeenCalledWith('user_123');
  });
});
