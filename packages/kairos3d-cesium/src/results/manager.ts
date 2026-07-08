import type { KairosMap } from "../core";
import { Evented } from "../core/events";
import type {
  ResultManagerEvents,
  ResultQueryOptions,
  ResultRecord,
  ResultSource,
  SDKManagedResult
} from "./types";

interface ResultStore<R extends SDKManagedResult> {
  get(id: string): R | undefined;
  list(): R[];
  remove(id: string): boolean;
  clear(): void;
  on<K extends "add" | "remove" | "clear">(
    type: K,
    listener: (event: { data: K extends "clear" ? R[] : R }) => void
  ): () => void;
}

export class ResultManager extends Evented<ResultManagerEvents> {
  private readonly offListeners: Array<() => void> = [];

  constructor(private readonly map: KairosMap) {
    super();
    for (const source of resultSources) {
      this.bindStore(source, this.getStore(source));
    }
  }

  list(options: ResultQueryOptions = {}): ResultRecord[] {
    const sources = normalizeSources(options.source);
    const types = normalizeTypes(options.type);
    const records = sources.flatMap((source) =>
      this.getStore(source).list().map((result) => toRecord(source, result))
    );

    if (!types) {
      return records;
    }

    return records.filter((record) => types.has(record.type));
  }

  count(options: ResultQueryOptions = {}): number {
    return this.list(options).length;
  }

  get(id: string, source?: ResultSource): ResultRecord | undefined {
    if (source) {
      const result = this.getStore(source).get(id);
      return result ? toRecord(source, result) : undefined;
    }

    for (const currentSource of resultSources) {
      const result = this.getStore(currentSource).get(id);
      if (result) {
        return toRecord(currentSource, result);
      }
    }

    return undefined;
  }

  remove(id: string, source?: ResultSource): boolean {
    if (source) {
      return this.getStore(source).remove(id);
    }

    const record = this.get(id);
    return record ? this.getStore(record.source).remove(id) : false;
  }

  clear(options: ResultQueryOptions = {}): ResultRecord[] {
    const records = this.list(options);
    const clearWholeSource =
      options.type === undefined &&
      options.source !== undefined &&
      records.length > 0;

    if (clearWholeSource) {
      for (const source of normalizeSources(options.source)) {
        this.getStore(source).clear();
      }
      return records;
    }

    for (const record of records) {
      this.getStore(record.source).remove(record.id);
    }
    return records;
  }

  destroy(): void {
    for (const off of this.offListeners.splice(0)) {
      off();
    }
    this.off();
  }

  private bindStore<R extends SDKManagedResult>(
    source: ResultSource,
    store: ResultStore<R>
  ): void {
    this.offListeners.push(
      store.on("add", (event) => this.emit("add", toRecord(source, event.data))),
      store.on("remove", (event) => this.emit("remove", toRecord(source, event.data))),
      store.on("clear", (event) =>
        this.emit(
          "clear",
          event.data.map((result) => toRecord(source, result))
        )
      )
    );
  }

  private getStore(source: ResultSource): ResultStore<SDKManagedResult> {
    switch (source) {
      case "draw":
        return this.map.draw as unknown as ResultStore<SDKManagedResult>;
      case "measure":
        return this.map.analysis.measure as unknown as ResultStore<SDKManagedResult>;
      case "visibility":
        return this.map.analysis.visibility as unknown as ResultStore<SDKManagedResult>;
      case "profile":
        return this.map.analysis.profile as unknown as ResultStore<SDKManagedResult>;
      case "clipping":
        return this.map.analysis.clipping as unknown as ResultStore<SDKManagedResult>;
      case "terrain":
        return this.map.analysis.terrain as unknown as ResultStore<SDKManagedResult>;
    }
  }
}

const resultSources: ResultSource[] = [
  "draw",
  "measure",
  "visibility",
  "profile",
  "clipping",
  "terrain"
];

function toRecord<R extends SDKManagedResult>(
  source: ResultSource,
  result: R
): ResultRecord<R> {
  return {
    id: result.id,
    source,
    type: result.type,
    result,
    createdAt: result.createdAt
  };
}

function normalizeSources(source: ResultQueryOptions["source"]): ResultSource[] {
  return source ? (Array.isArray(source) ? source : [source]) : resultSources;
}

function normalizeTypes(
  type: ResultQueryOptions["type"]
): Set<SDKManagedResult["type"]> | undefined {
  if (!type) {
    return undefined;
  }
  return new Set(Array.isArray(type) ? type : [type]);
}
