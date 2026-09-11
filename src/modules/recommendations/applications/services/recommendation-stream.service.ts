import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, Subscriber } from 'rxjs';
import { Repository } from 'typeorm';
import { RecommendationEvent } from '../../infrastructure/persistence/typeorm/entities/recommendation-event.entity';
import { RecommendationRequest } from '../../infrastructure/persistence/typeorm/entities/recommendation-request.entity';
import { RecommendationEventService } from './recommendation-event.service';

const DATABASE_POLL_INTERVAL_MS = 1_500;

@Injectable()
export class RecommendationStreamService {
  private readonly logger = new Logger(RecommendationStreamService.name);

  constructor(
    @InjectRepository(RecommendationRequest)
    private readonly requestRepository: Repository<RecommendationRequest>,
    private readonly eventService: RecommendationEventService,
  ) {}

  stream(requestId: string, lastEventId = '0'): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let initialized = false;
      let polling = false;
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
          id: latestEventId.toString(),
          data: { requestId, serverTime: new Date().toISOString() },
        });
      }, 15_000);
      const databasePoll = setInterval(() => {
        if (!initialized || polling || subscriber.closed) return;
        polling = true;
        void (async () => {
          try {
            const events = await this.eventService.findAfter(
              requestId,
              latestEventId.toString(),
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
            if (subscriber.closed) return;
            const current = await this.requestRepository.findOne({
              where: { id: requestId },
            });
            this.emitTerminalSnapshotIfNeeded(
              subscriber,
              current,
              latestEventId,
            );
          } catch (error) {
            this.logger.warn(
              `Recommendation stream database poll failed for ${requestId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          } finally {
            polling = false;
          }
        })();
      }, DATABASE_POLL_INTERVAL_MS);

      void (async () => {
        try {
          const request = await this.requestRepository.findOne({
            where: { id: requestId },
          });
          subscriber.next({
            type: 'connected',
            id: latestEventId.toString(),
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
          this.emitTerminalSnapshotIfNeeded(subscriber, request, latestEventId);
        } catch (error) {
          subscriber.error(error);
        }
      })();

      return () => {
        clearInterval(heartbeat);
        clearInterval(databasePoll);
        removeListener();
      };
    });
  }

  private isTerminalStatus(status: string | undefined): boolean {
    return status === 'COMPLETED' || status === 'FAILED';
  }

  private emitTerminalSnapshotIfNeeded(
    subscriber: Subscriber<MessageEvent>,
    request: RecommendationRequest | null,
    latestEventId: bigint,
  ): void {
    if (!request || subscriber.closed || !this.isTerminalStatus(request.status))
      return;
    if (request.status === 'COMPLETED') {
      subscriber.next({
        id: latestEventId.toString(),
        type: 'completed',
        data: request.result ?? {
          requestId: request.id,
          status: 'COMPLETED',
          resultUrl: `/api/v1/recommendation-requests/${request.id}`,
        },
      });
    } else {
      subscriber.next({
        id: latestEventId.toString(),
        type: 'failed',
        data: {
          code: request.failureCode ?? 'RECOMMENDATION_ANALYSIS_FAILED',
          message:
            request.failureMessage ?? '추천 분석 중 오류가 발생했습니다.',
          retryable: false,
        },
      });
    }
    subscriber.complete();
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
