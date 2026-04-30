CREATE TABLE "StudentFeeCredit" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFeeCredit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentFeeCredit_studentId_key" ON "StudentFeeCredit"("studentId");

ALTER TABLE "StudentFeeCredit" ADD CONSTRAINT "StudentFeeCredit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
