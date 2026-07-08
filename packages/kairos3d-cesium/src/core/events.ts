export interface KairosEvent<TData = unknown> {
  type: string;
  target: Evented<any>;
  data: TData;
}

export type EventListener<TData = unknown> = (event: KairosEvent<TData>) => void;

type EventKey<TEvents> = Extract<keyof TEvents, string>;

export class Evented<TEvents extends object = Record<string, unknown>> {
  private readonly listeners = new Map<string, Set<EventListener<any>>>();

  on<K extends EventKey<TEvents>>(
    type: K,
    listener: EventListener<TEvents[K]>
  ): () => void {
    const bucket = this.listeners.get(type) ?? new Set<EventListener<any>>();
    bucket.add(listener as EventListener);
    this.listeners.set(type, bucket);

    return () => this.off(type, listener as EventListener<TEvents[K]>);
  }

  once<K extends EventKey<TEvents>>(
    type: K,
    listener: EventListener<TEvents[K]>
  ): () => void {
    const off = this.on(type, (event) => {
      off();
      listener(event as KairosEvent<TEvents[K]>);
    });

    return off;
  }

  off<K extends EventKey<TEvents>>(
    type?: K,
    listener?: EventListener<TEvents[K]>
  ): void {
    if (!type) {
      this.listeners.clear();
      return;
    }

    if (!listener) {
      this.listeners.delete(type);
      return;
    }

    const bucket = this.listeners.get(type);
    bucket?.delete(listener as EventListener<any>);
    if (bucket?.size === 0) {
      this.listeners.delete(type);
    }
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  protected emit<K extends EventKey<TEvents>>(type: K, data: TEvents[K]): void;
  protected emit(type: string, data?: unknown): void;
  protected emit(type: string, data?: unknown): void {
    const bucket = this.listeners.get(type);
    if (!bucket) {
      return;
    }

    const event = { type, target: this, data };
    for (const listener of [...bucket]) {
      listener(event as KairosEvent);
    }
  }
}
