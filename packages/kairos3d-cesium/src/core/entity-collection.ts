import type { Entity, EntityCollection } from "cesium";

export function removeEntityIfOwned(
  collection: EntityCollection,
  entity: Entity
): boolean {
  const getById = (collection as Partial<EntityCollection>).getById;
  if (
    typeof getById === "function" &&
    getById.call(collection, entity.id) !== entity
  ) {
    return false;
  }
  return collection.remove(entity);
}

export function removeEntityIfOwnedTracked(
  collection: EntityCollection,
  entity: Entity,
  detached: Entity[]
): void {
  const ownershipBefore = getEntityOwnership(collection, entity);
  if (ownershipBefore === false) {
    return;
  }

  let removed = false;
  try {
    removed = removeEntityIfOwned(collection, entity);
  } finally {
    const ownershipAfter = getEntityOwnership(collection, entity);
    if (
      (ownershipAfter === false || (ownershipAfter === undefined && removed)) &&
      !detached.includes(entity)
    ) {
      detached.push(entity);
    }
  }
}

function getEntityOwnership(
  collection: EntityCollection,
  entity: Entity
): boolean | undefined {
  const getById = (collection as Partial<EntityCollection>).getById;
  return typeof getById === "function"
    ? getById.call(collection, entity.id) === entity
    : undefined;
}
