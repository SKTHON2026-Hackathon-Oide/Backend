import { Injectable, MessageEvent } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, Subscriber } from 'rxjs';
import { Repository } from 'typeorm';
import { RecommendationEvent } from '../../infrastructure/persistence/typeorm/entities/recommendation-event.entity';
import { RecommendationRequest } from '../../infrastructure/persistence/typeorm/entities/recommendation-request.entity';
import { RecommendationEventService } from './recommendation-event.service';

@Injectable()
export class RecommendationStreamService {
  constructor(
    @InjectRepository(RecommendationRequest)
    private readonly requestRepository: Repository<RecommendationRequest>,
    private readonly eventService: RecommendationEventService,
  ) {}

  stream(requestId: string, lastEventId = '0'): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let initialized = false;
      let latestEventId = BigInt(lastEventId || '0');
      const buffered: RecommendationEvent[] = [];
      const removeListener = this.eventService.subscribe(requestId, (event) => {
        if (!initialized) {
          buffered.push(event);
          return;
        }
        this.emitEventIfNew(
          subscriber,
          event,
          () => latestEventId,
          (id) => {
            latestEventId = id;
          },
        );
      });
      const heartbeat = setInterval(() => {
        subscriber.next({
          type: 'heartbeat',
          data: { requestId, serverTime: new Date().toISOString() },
        });
      }, 15_000);

      void (async () => {
        try {
          const request = await this.requestRepository.findOne({
            where: { id: requestId },
          });
          subscriber.next({
            type: 'connected',
            id: '0',
            data: {
              requestId,
              status: request?.status ?? 'UNKNOWN',
              progress: request?.progress ?? 0,
            },
          });
          const events = await this.eventService.findAfter(
            requestId,
            lastEventId,
          );
          for (const event of events) {
            this.emitEventIfNew(
              subscriber,
              event,
              () => latestEventId,
              (id) => {
                latestEventId = id;
              },
            );
          }
          initialized = true;
          buffered
            .sort((left, right) => {
              const leftId = BigInt(left.id);
              const rightId = BigInt(right.id);
              return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
            })
            .forEach((event) =>
              this.emitEventIfNew(
                subscriber,
                event,
                () => latestEventId,
                (id) => {
                  latestEventId = id;
                },
              ),
            );
          buffered.length = 0;
        } catch (error) {
          subscriber.error(error);
        }
      })();

      return () => {
        clearInterval(heartbeat);
        removeListener();
      };
    });
  }

  private emitEventIfNew(
    subscriber: Subscriber<MessageEvent>,
    event: RecommendationEvent,
    getLatestId: () => bigint,
    setLatestId: (id: bigint) => void,
  ): void {
    const eventId = BigInt(event.id);
    if (eventId <= getLatestId()) return;
    setLatestId(eventId);
    subscriber.next({
      id: event.id,
      type: event.eventType,
      data: event.payload,
    });
    if (event.eventType === 'completed' || event.eventType === 'failed') {
      subscriber.complete();
    }
  }
}
