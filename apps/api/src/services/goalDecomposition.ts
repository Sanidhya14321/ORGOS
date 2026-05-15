import type { Job } from "bullmq";
import type { FastifyInstance } from "fastify";
import { canReachRedisUrl } from "../lib/clients.js";
import { getCsuiteQueue } from "../queue/index.js";
import { processCsuiteDecomposeJob } from "../queue/workers/decompose.csuite.worker.js";
import { processManagerDecomposeJob, type ManagerJobData } from "../queue/workers/decompose.manager.worker.js";
import { processIndividualAckJob } from "../queue/workers/decompose.individual.worker.js";
import { processExecuteJob } from "../queue/workers/execute.worker.js";

const inlineGoalDecompositions = new Set<string>();

function normalizeManagerDeadline(deadline: string | null | undefined): string {
  if (deadline && !Number.isNaN(Date.parse(deadline))) {
    return new Date(deadline).toISOString();
  }
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

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
        { data: { goalId } } as Job<{ goalId: string }>,
        undefined,
        {
          enqueueManagerDecompose: async (managerJob) => {
            const payload: ManagerJobData = {
              mode: "decompose",
              goalId: managerJob.goalId,
              directive: managerJob.directive,
              department: managerJob.department,
              deadline: normalizeManagerDeadline(managerJob.deadline)
            };
            await processManagerDecomposeJob({ data: payload } as Job<ManagerJobData>, {
              enqueueIndividualAck: async (taskId: string) => {
                await processIndividualAckJob({ data: { taskId } } as Job<{ taskId: string }>);
              },
              enqueueExecute: async (taskId: string) => {
                await processExecuteJob({ data: { taskId } } as Job<{ taskId: string }>);
              }
            });
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
