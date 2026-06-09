ALTER TABLE "FeePayment"
ADD COLUMN "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "feeMonth" TEXT,
ADD COLUMN "academicSession" TEXT;

CREATE INDEX "FeePayment_paymentDate_idx" ON "FeePayment"("paymentDate");
CREATE INDEX "FeePayment_feeMonth_idx" ON "FeePayment"("feeMonth");
