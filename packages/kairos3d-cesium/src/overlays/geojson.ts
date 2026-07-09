import type { SerializablePosition } from "../core";
import type {
  KairosGeoJsonFeature,
  KairosGeoJsonFeatureCollection,
  OverlaySnapshot,
  OverlayType
} from "./types";

export interface SnapshotLike {
  id: string;
  type: OverlayType;
  positions: SerializablePosition[];
  properties?: Record<string, unknown>;
  createdAt?: string;
}

export function snapshotsToGeoJSON<TSnapshot extends SnapshotLike>(
  snapshots: TSnapshot[]
): KairosGeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: snapshots.map((snapshot) => ({
      type: "Feature",
      id: snapshot.id,
      geometry: snapshotToGeometry(snapshot),
      properties: {
        ...(snapshot.properties ?? {}),
        kairos: {
          type: snapshot.type,
          snapshot
        }
      }
    }))
  };
}

export function geoJSONToSnapshots<TSnapshot extends SnapshotLike>(
  geojson: KairosGeoJsonFeatureCollection,
  defaults: { show?: boolean } = {}
): TSnapshot[] {
  if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error("GeoJSON input must be a FeatureCollection.");
  }

  return geojson.features.map((feature, index) => {
    const embedded = readEmbeddedSnapshot<TSnapshot>(feature);
    if (embedded) {
      return embedded;
    }

    return featureToBasicSnapshot(feature, index, defaults) as unknown as TSnapshot;
  });
}

function readEmbeddedSnapshot<TSnapshot extends SnapshotLike>(
  feature: KairosGeoJsonFeature
): TSnapshot | undefined {
  const kairos = feature.properties?.kairos;
  if (!isRecord(kairos)) {
    return undefined;
  }

  const snapshot = kairos.snapshot;
  return isRecord(snapshot) ? (snapshot as unknown as TSnapshot) : undefined;
}

function featureToBasicSnapshot(
  feature: KairosGeoJsonFeature,
  index: number,
  defaults: { show?: boolean }
): OverlaySnapshot {
  const properties = stripKairosProperty(feature.properties);
  const id = typeof feature.id === "string" ? feature.id : `geojson-${index + 1}`;
  const createdAt = new Date().toISOString();

  if (feature.geometry.type === "Point") {
    return {
      id,
      type: "point",
      positions: [coordinatesToPosition(feature.geometry.coordinates)],
      properties,
      show: defaults.show ?? true,
      createdAt
    };
  }

  if (feature.geometry.type === "LineString") {
    return {
      id,
      type: "polyline",
      positions: feature.geometry.coordinates.map(coordinatesToPosition),
      properties,
      show: defaults.show ?? true,
      createdAt
    };
  }

  return {
    id,
    type: "polygon",
    positions: removeClosingPosition(
      feature.geometry.coordinates[0]?.map(coordinatesToPosition) ?? []
    ),
    properties,
    show: defaults.show ?? true,
    createdAt
  };
}

function snapshotToGeometry(snapshot: SnapshotLike): KairosGeoJsonFeature["geometry"] {
  if (snapshot.type === "polyline" || snapshot.type === "wall" || snapshot.type === "corridor") {
    return {
      type: "LineString",
      coordinates: snapshot.positions.map(positionToCoordinates)
    };
  }

  if (snapshot.type === "polygon" || snapshot.type === "rectangle") {
    return {
      type: "Polygon",
      coordinates: [positionsToClosedCoordinates(snapshot.positions)]
    };
  }

  return {
    type: "Point",
    coordinates: positionToCoordinates(snapshot.positions[0])
  };
}

function positionsToClosedCoordinates(positions: SerializablePosition[]): number[][] {
  const coordinates = positions.map(positionToCoordinates);
  if (coordinates.length === 0) {
    return coordinates;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1] || first[2] !== last[2]) {
    coordinates.push([...first]);
  }
  return coordinates;
}

function removeClosingPosition(positions: SerializablePosition[]): SerializablePosition[] {
  if (positions.length < 2) {
    return positions;
  }

  const first = positions[0];
  const last = positions[positions.length - 1];
  if (
    first.longitude === last.longitude &&
    first.latitude === last.latitude &&
    first.height === last.height
  ) {
    return positions.slice(0, -1);
  }
  return positions;
}

function positionToCoordinates(position: SerializablePosition | undefined): number[] {
  if (!position) {
    return [0, 0, 0];
  }
  return [position.longitude, position.latitude, position.height];
}

function coordinatesToPosition(coordinates: number[]): SerializablePosition {
  return {
    longitude: coordinates[0] ?? 0,
    latitude: coordinates[1] ?? 0,
    height: coordinates[2] ?? 0
  };
}

function stripKairosProperty(properties: Record<string, unknown> = {}): Record<string, unknown> {
  const { kairos: _kairos, ...rest } = properties;
  return rest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
