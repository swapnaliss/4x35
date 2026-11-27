// System tables that carry no workspace and no content (M1-03): `job_timings` (M1-05) holds a job
// id, a kind, a batch id, a chunk number, milliseconds and an outcome. It is written by the job
// wrapper, which runs outside any request, so it has no workspace to scope by.
import { asc, eq } from "drizzle-orm";
import { jobTimings } from "../schema/index.js";
import type { Executor, JobTimingInsert, JobTimingRow } from "./types.js";

export interface SystemRepository {
  readonly jobTimings: {
    insert(v: JobTimingInsert): Promise<void>;
    /** Every attempt of one job, oldest first. */
    listByJob(jobId: string): Promise<JobTimingRow[]>;
  };
}

export function systemRepository(db: Executor): SystemRepository {
  return {
    jobTimings: {
      insert: async (v) => {
        await db.insert(jobTimings).values(v);
      },
      listByJob: async (jobId) =>
        db
          .select()
          .from(jobTimings)
          .where(eq(jobTimings.jobId, jobId))
          .orderBy(asc(jobTimings.at), asc(jobTimings.id)),
    },
  };
}
