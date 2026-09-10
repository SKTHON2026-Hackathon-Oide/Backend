import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = module.get(AppController);
  });

  it('returns the service status', () => {
    expect(controller.getRoot()).toEqual({
      service: 'skthon-backend',
      status: 'ok',
    });
  });
});
