import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { allocateFefoBatches, toStartOfDayUTC } from '../domain/fefo';
import { DomainError } from '../domain/errors';

export class StockService {
  async createCategory(name: string) {
    return prisma.category.create({ data: { name } });
  }

  async listCategories() {
    return prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async createProduct(data: {
    sku: string;
    name: string;
    unit: string;
    minStock: number;
    categoryId: string;
  }) {
    return prisma.product.create({ data });
  }

  async listProducts() {
    const products = await prisma.product.findMany({
      include: {
        category: true,
        batches: {
          where: { currentQuantity: { gt: 0 } },
          orderBy: { expirationDate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const todayUTC = toStartOfDayUTC(new Date());

    return products.map((product) => {
      let validStock = 0;
      let expiredStock = 0;

      for (const batch of product.batches) {
        if (toStartOfDayUTC(batch.expirationDate) >= todayUTC) {
          validStock += batch.currentQuantity;
        } else {
          expiredStock += batch.currentQuantity;
        }
      }

      return {
        ...product,
        validStock,
        expiredStock,
        isLowStock: validStock < product.minStock,
      };
    });
  }

  async addBatch(data: {
    productId: string;
    batchCode: string;
    quantity: number;
    unitCostInCents: number;
    expirationDate: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          productId: data.productId,
          batchCode: data.batchCode,
          initialQuantity: data.quantity,
          currentQuantity: data.quantity,
          unitCostInCents: data.unitCostInCents,
          expirationDate: data.expirationDate,
        },
      });

      await tx.stockMovement.create({
        data: {
          type: 'IN',
          productId: data.productId,
          totalQuantity: data.quantity,
          reason: `Entrada do lote ${data.batchCode}`,
          items: {
            create: {
              batchId: batch.id,
              quantity: data.quantity,
              unitCostInCents: data.unitCostInCents,
            },
          },
        },
      });

      return batch;
    });
  }

  async previewFefoWithdrawal(productId: string, quantity: number) {
    const availableBatches = await prisma.batch.findMany({
      where: {
        productId,
        currentQuantity: { gt: 0 },
      },
    });

    return allocateFefoBatches(availableBatches, quantity);
  }

  async withdrawProductFefo(productId: string, quantity: number, reason?: string) {
    return prisma.$transaction(
      async (tx) => {
        const availableBatches = await tx.batch.findMany({
          where: {
            productId,
            currentQuantity: { gt: 0 },
          },
        });

        const allocations = allocateFefoBatches(availableBatches, quantity);

        for (const alloc of allocations) {
          const updated = await tx.batch.updateMany({
            where: {
              id: alloc.batchId,
              currentQuantity: { gte: alloc.takenQuantity },
            },
            data: {
              currentQuantity: { decrement: alloc.takenQuantity },
            },
          });

          if (updated.count === 0) {
            throw new DomainError(
              `Conflito de concorrência no lote ${alloc.batchCode}. Tente novamente.`
            );
          }
        }

        const movement = await tx.stockMovement.create({
          data: {
            type: 'OUT_CONSUMPTION',
            productId,
            totalQuantity: quantity,
            reason: reason || 'Saída de consumo (FEFO automático)',
            items: {
              create: allocations.map((alloc) => ({
                batchId: alloc.batchId,
                quantity: alloc.takenQuantity,
                unitCostInCents: alloc.unitCostInCents,
              })),
            },
          },
          include: {
            items: { include: { batch: true } },
          },
        });

        return { movement, allocations };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  }

  async registerBatchLoss(batchId: string, quantity: number, reason: string) {
    return prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({ where: { id: batchId } });

      if (!batch) {
        throw new DomainError('Lote não encontrado.');
      }

      if (batch.currentQuantity < quantity) {
        throw new DomainError(
          `Quantidade de descarte (${quantity}) maior que o saldo do lote (${batch.currentQuantity}).`
        );
      }

      await tx.batch.update({
        where: { id: batchId },
        data: { currentQuantity: { decrement: quantity } },
      });

      const movement = await tx.stockMovement.create({
        data: {
          type: 'OUT_LOSS',
          productId: batch.productId,
          totalQuantity: quantity,
          reason,
          items: {
            create: {
              batchId: batch.id,
              quantity,
              unitCostInCents: batch.unitCostInCents,
            },
          },
        },
      });

      return movement;
    });
  }
}

export const stockService = new StockService();