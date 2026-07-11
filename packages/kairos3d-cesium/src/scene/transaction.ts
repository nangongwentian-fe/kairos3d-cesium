export interface PreparedSceneStage {
  readonly phase: string;
  commit(): void | Promise<void>;
  rollback(): void | Promise<void>;
  finalize(): void | Promise<void>;
  dispose(): void | Promise<void>;
  publish(): void;
}

export interface ScenePreflightResult {
  readonly phase: string;
  readonly value?: unknown;
}

export interface SceneStagePlan {
  readonly phase: string;
  preflight?(): void | ScenePreflightResult | Promise<void | ScenePreflightResult>;
  prepare(preflight?: ScenePreflightResult): PreparedSceneStage | Promise<PreparedSceneStage>;
}

/** @internal Runs every validation-only preflight before preparing detached runtime. */
export async function prepareSceneStagePlans(
  plans: readonly SceneStagePlan[]
): Promise<PreparedSceneStage[]> {
  const preflightResults: Array<ScenePreflightResult | undefined> = [];
  for (const plan of plans) {
    const result = await plan.preflight?.();
    if (result && result.phase !== plan.phase) {
      throw new Error(
        `Scene preflight phase "${result.phase}" does not match plan "${plan.phase}".`
      );
    }
    preflightResults.push(result || undefined);
  }

  const stages: PreparedSceneStage[] = [];
  try {
    for (let index = 0; index < plans.length; index += 1) {
      stages.push(await plans[index].prepare(preflightResults[index]));
    }
    return stages;
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    for (const stage of [...stages].reverse()) {
      try {
        await stage.dispose();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "Scene stage preparation and cleanup failed."
      );
    }
    throw error;
  }
}
