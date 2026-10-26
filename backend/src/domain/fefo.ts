import { InsufficientStockError, InvalidQuantityError } from './errors';

export interface BatchInput {
  id: string;
  batchCode: string;
  currentQuantity: number;
  unitCostInCents: number;
  expirationDate: Date;
  createdAt: Date;
}

export interface BatchAllocation {
  batchId: string;
  batchCode: string;
  takenQuantity: number;
  remainingInBatch: number;
  unitCostInCents: number;
  expirationDate: Date;
}

export function toStartOfDayUTC(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function allocateFefoBatches(
  batches: BatchInput[],
  requestedQuantity: number,
  referenceDate: Date = new Date()
): BatchAllocation[] {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new InvalidQuantityError();
  }

  const todayUTC = toStartOfDayUTC(referenceDate);

  const validBatches = batches.filter((batch) => {
    const expUTC = toStartOfDayUTC(batch.expirationDate);
    return batch.currentQuantity > 0 && expUTC >= todayUTC;
  });

  const totalAvailable = validBatches.reduce(
    (sum, batch) => sum + batch.currentQuantity,
    0
  );

  if (totalAvailable < requestedQuantity) {
    throw new InsufficientStockError(requestedQuantity, totalAvailable);
  }

  const sortedBatches = [...validBatches].sort((a, b) => {
    const expDiff =
      toStartOfDayUTC(a.expirationDate) - toStartOfDayUTC(b.expirationDate);
    if (expDiff !== 0) return expDiff;

    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;

    return a.id.localeCompare(b.id);
  });

  const allocations: BatchAllocation[] = [];
  let remainingToTake = requestedQuantity;

  for (const batch of sortedBatches) {
    if (remainingToTake === 0) break;

    const taken = Math.min(batch.currentQuantity, remainingToTake);
    remainingToTake -= taken;

    allocations.push({
      batchId: batch.id,
      batchCode: batch.batchCode,
      takenQuantity: taken,
      remainingInBatch: batch.currentQuantity - taken,
      unitCostInCents: batch.unitCostInCents,
      expirationDate: batch.expirationDate,
    });
  }

  return allocations;
}