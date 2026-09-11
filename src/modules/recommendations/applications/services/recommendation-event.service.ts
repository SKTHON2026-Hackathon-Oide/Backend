import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { RecommendationEvent } from '../../infrastructure/persistence/typeorm/entities/recommendation-event.entity';

export type RecommendationEventListener = (event: RecommendationEvent) => void;

@Injectable()
export class RecommendationEventService {
  private readonly listeners = new Map<
    string,
    Set<RecommendationEventListener>
  >();

  constructor(
    @InjectRepository(RecommendationEvent)
    private readonly eventRepository: Repository<RecommendationEvent>,
  ) {}

  async publish(
    requestId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<RecommendationEvent> {
    const saved = await this.eventRepository.save(
      this.eventRepository.create({ requestId, eventType, payload }),
    );
    for (const listener of this.listeners.get(requestId) ?? []) {
      listener(saved);
    }
    return saved;
  }

  findAfter(
    requestId: string,
    afterId: string,
  ): Promise<RecommendationEvent[]> {
    return this.eventRepository.find({
      where: { requestId, id: MoreThan(afterId) },
      order: { id: 'ASC' },
    });
  }

  subscribe(
    requestId: string,
    listener: RecommendationEventListener,
  ): () => void {
    let listeners = this.listeners.get(requestId);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(requestId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) this.listeners.delete(requestId);
    };
  }
}
