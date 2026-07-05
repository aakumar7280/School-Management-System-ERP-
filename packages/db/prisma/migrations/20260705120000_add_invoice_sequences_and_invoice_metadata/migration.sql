-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "currentSequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "FeeInvoice"
ADD COLUMN "invoiceNumber" TEXT,
ADD COLUMN "academicYearId" TEXT,
ADD COLUMN "invoiceSequence" INTEGER,
ADD COLUMN "billingPeriod" TEXT,
ADD COLUMN "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "paymentStatus" "InvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSequence_academicYearId_key" ON "InvoiceSequence"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeInvoice_invoiceNumber_key" ON "FeeInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FeeInvoice_academicYearId_invoiceSequence_key" ON "FeeInvoice"("academicYearId", "invoiceSequence");
