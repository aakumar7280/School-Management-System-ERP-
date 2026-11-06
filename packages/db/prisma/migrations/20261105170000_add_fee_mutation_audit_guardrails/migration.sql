CREATE TABLE "FeeMutationAudit" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "requestId" TEXT,
    "method" TEXT,
    "route" TEXT,
    "source" TEXT,
    "reason" TEXT,
    "affectedCount" INTEGER NOT NULL DEFAULT 0,
    "affectedIds" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeMutationAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeeMutationAudit_schoolId_createdAt_idx" ON "FeeMutationAudit"("schoolId", "createdAt");
CREATE INDEX "FeeMutationAudit_requestId_idx" ON "FeeMutationAudit"("requestId");
CREATE INDEX "FeeMutationAudit_action_createdAt_idx" ON "FeeMutationAudit"("action", "createdAt");
