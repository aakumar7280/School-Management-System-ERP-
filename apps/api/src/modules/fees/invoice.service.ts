type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

type InvoiceMetadataInput = {
  dueDate: Date;
  invoiceDate?: Date;
  subtotal: number;
  discount: number;
  total: number;
  paymentStatus: PaymentStatus;
};

export class InvoiceService {
  static deriveAcademicYearId(date: Date) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const startYear = month >= 4 ? year : year - 1;
    const endYear = (startYear + 1) % 100;
    return `${startYear}-${String(endYear).padStart(2, '0')}`;
  }

  static deriveBillingPeriod(date: Date) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(date);
  }

  static async reserveInvoiceIdentity(tx: any, date: Date) {
    const academicYearId = this.deriveAcademicYearId(date);

    const sequence = await tx.invoiceSequence.upsert({
      where: { academicYearId },
      update: {
        currentSequence: {
          increment: 1
        }
      },
      create: {
        academicYearId,
        currentSequence: 1
      },
      select: {
        currentSequence: true
      }
    });

    const invoiceSequence = sequence.currentSequence;
    const invoiceNumber = `INV-${academicYearId}-${String(invoiceSequence).padStart(6, '0')}`;

    return {
      academicYearId,
      invoiceSequence,
      invoiceNumber
    };
  }

  static async buildCreateData(
    tx: any,
    input: InvoiceMetadataInput
  ) {
    const invoiceDate = input.invoiceDate ?? new Date();
    const identity = await this.reserveInvoiceIdentity(tx, invoiceDate);

    return {
      ...identity,
      billingPeriod: this.deriveBillingPeriod(input.dueDate),
      invoiceDate,
      dueDate: input.dueDate,
      subtotal: Number(input.subtotal.toFixed(2)),
      discount: Number(input.discount.toFixed(2)),
      total: Number(input.total.toFixed(2)),
      paymentStatus: input.paymentStatus
    };
  }
}
