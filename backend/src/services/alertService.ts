import { prisma } from '../lib/prisma';
import { toStartOfDayUTC } from '../domain/fefo';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export class AlertService {
  async getExpirationDashboard(referenceDate: Date = new Date()) {
    const todayUTC = toStartOfDayUTC(referenceDate);

    const activeBatches = await prisma.batch.findMany({
      where: { currentQuantity: { gt: 0 } },
      include: {
        product: {
          include: { category: true },
        },
      },
      orderBy: { expirationDate: 'asc' },
    });

    const expired = [];
    const within7Days = [];
    const within15Days = [];
    const within30Days = [];

    let expiredValueInCents = 0;
    let risk7DaysValueInCents = 0;
    let risk15DaysValueInCents = 0;
    let risk30DaysValueInCents = 0;

    for (const batch of activeBatches) {
      const expUTC = toStartOfDayUTC(batch.expirationDate);
      const daysUntilExpiration = Math.round((expUTC - todayUTC) / MS_PER_DAY);
      const totalBatchValueInCents = batch.currentQuantity * batch.unitCostInCents;

      const enrichedBatch = {
        id: batch.id,
        batchCode: batch.batchCode,
        productId: batch.productId,
        productName: batch.product.name,
        sku: batch.product.sku,
        unit: batch.product.unit,
        categoryName: batch.product.category.name,
        currentQuantity: batch.currentQuantity,
        unitCostInCents: batch.unitCostInCents,
        totalValueInCents: totalBatchValueInCents,
        expirationDate: batch.expirationDate,
        daysUntilExpiration,
      };

      if (daysUntilExpiration < 0) {
        expired.push(enrichedBatch);
        expiredValueInCents += totalBatchValueInCents;
      } else if (daysUntilExpiration <= 7) {
        within7Days.push(enrichedBatch);
        risk7DaysValueInCents += totalBatchValueInCents;
      } else if (daysUntilExpiration <= 15) {
        within15Days.push(enrichedBatch);
        risk15DaysValueInCents += totalBatchValueInCents;
      } else if (daysUntilExpiration <= 30) {
        within30Days.push(enrichedBatch);
        risk30DaysValueInCents += totalBatchValueInCents;
      }
    }

    return {
      summary: {
        expiredCount: expired.length,
        expiredValueInCents,
        within7DaysCount: within7Days.length,
        risk7DaysValueInCents,
        within15DaysCount: within15Days.length,
        risk15DaysValueInCents,
        within30DaysCount: within30Days.length,
        risk30DaysValueInCents,
      },
      buckets: {
        expired,
        within7Days,
        within15Days,
        within30Days,
      },
    };
  }

  async getFinancialLossReport() {
    const movements = await prisma.stockMovement.findMany({
      include: {
        product: true,
        items: {
          include: { batch: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalConsumptionValueInCents = 0;
    let totalConsumptionUnits = 0;
    let totalRegisteredLossValueInCents = 0;
    let totalRegisteredLossUnits = 0;

    for (const mov of movements) {
      const movementCost = mov.items.reduce(
        (acc, item) => acc + item.quantity * item.unitCostInCents,
        0
      );

      if (mov.type === 'OUT_CONSUMPTION') {
        totalConsumptionValueInCents += movementCost;
        totalConsumptionUnits += mov.totalQuantity;
      } else if (mov.type === 'OUT_LOSS') {
        totalRegisteredLossValueInCents += movementCost;
        totalRegisteredLossUnits += mov.totalQuantity;
      }
    }

    const totalOutValue = totalConsumptionValueInCents + totalRegisteredLossValueInCents;
    const lossPercentage =
      totalOutValue > 0
        ? Number(((totalRegisteredLossValueInCents / totalOutValue) * 100).toFixed(2))
        : 0;

    return {
      metrics: {
        totalConsumptionValueInCents,
        totalConsumptionUnits,
        totalRegisteredLossValueInCents,
        totalRegisteredLossUnits,
        lossPercentage,
      },
      recentMovements: movements.slice(0, 20),
    };
  }
}

export const alertService = new AlertService();