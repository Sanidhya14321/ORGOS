import type { FastifyInstance } from "fastify";
import { canReachRedisUrl } from "../lib/clients.js";
import { getCsuiteQueue } from "../queue/index.js";
import { processCsuiteDecomposeJob } from "../queue/workers/decompose.csuite.worker.js";
import { processManagerDecomposeJob } from "../queue/workers/decompose.manager.worker.js";

const inlineGoalDecompositions = new Set<string>();

export async function triggerGoalDecomposition(
  fastify: FastifyInstance,
  goalId: string
): Promise<"queued" | "inline" | "skipped"> {
  const queueReachable = await canReachRedisUrl(fastify.env.UPSTASH_REDIS_URL);

  if (queueReachable) {
    await getCsuiteQueue().add(
      "goal_decompose",
      { goalId },
      { jobId: `goal_decompose-${goalId}` }
    );
    return "queued";
  }

  if (inlineGoalDecompositions.has(goalId)) {
    return "skipped";
  }

  inlineGoalDecompositions.add(goalId);

  void (async () => {
    try {
      await processCsuiteDecomposeJob(
        { data: { goalId } } as never,
        undefined,
        {
          enqueueManagerDecompose: async (managerJob) => {
            await processManagerDecomposeJob(
              { data: managerJob } as never,
              {
                enqueueIndividualAck: async () => {},
                enqueueExecute: async () => {}
              }
            );
          }
        }
      );
    } catch (error) {
      fastify.log.error({ err: error, goalId }, "Inline goal decomposition failed");
    } finally {
      inlineGoalDecompositions.delete(goalId);
    }
  })();

  return "inline";
}
