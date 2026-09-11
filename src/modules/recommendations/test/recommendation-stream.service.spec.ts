import { firstValueFrom, toArray } from 'rxjs';
import type { Repository } from 'typeorm';
import { RecommendationStreamService } from '../applications/services/recommendation-stream.service';
import type { RecommendationEventService } from '../applications/services/recommendation-event.service';
import type { RecommendationRequest } from '../infrastructure/persistence/typeorm/entities/recommendation-request.entity';

describe('RecommendationStreamService', () => {
  it('returns the persisted result when completion was saved before its SSE event', async () => {
    const result = {
      requestId: '42',
      recommendations: [{ rank: 1, name: '테스트 상권' }],
    };
    const request = {
      id: '42',
      status: 'COMPLETED',
      progress: 100,
      result,
      failureCode: null,
      failureMessage: null,
    } as unknown as RecommendationRequest;
    const requestRepository = {
      findOne: jest.fn().mockResolvedValue(request),
    } as unknown as Repository<RecommendationRequest>;
    const eventService = {
      subscribe: jest.fn().mockReturnValue(jest.fn()),
      findAfter: jest.fn().mockResolvedValue([]),
    } as unknown as RecommendationEventService;
    const service = new RecommendationStreamService(
      requestRepository,
      eventService,
    );

    const events = await firstValueFrom(service.stream('42').pipe(toArray()));

    expect(events.map((event) => event.type)).toEqual([
      'connected',
      'completed',
    ]);
    expect(events.map((event) => event.id)).toEqual(['0', '0']);
    expect(events[1]?.data).toEqual(result);
  });
});
