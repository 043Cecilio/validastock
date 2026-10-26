import { describe, it, expect } from 'vitest';
import { allocateFefoBatches, BatchInput } from '../src/domain/fefo';
import { InsufficientStockError, InvalidQuantityError } from '../src/domain/errors';

describe('Domínio: Algoritmo de Alocação FEFO', () => {
  const referenceDate = new Date('2026-10-25T15:30:00Z');

  it('deve consumir múltiplos lotes na ordem exata de vencimento (10 do Lote A + 5 do Lote B)', () => {
    const batches: BatchInput[] = [
      {
        id: '2',
        batchCode: 'LOTE-B',
        currentQuantity: 30,
        unitCostInCents: 550,
        expirationDate: new Date('2026-12-01T00:00:00Z'),
        createdAt: new Date('2026-10-01T10:00:00Z'),
      },
      {
        id: '1',
        batchCode: 'LOTE-A',
        currentQuantity: 10,
        unitCostInCents: 500,
        expirationDate: new Date('2026-10-30T00:00:00Z'),
        createdAt: new Date('2026-10-05T10:00:00Z'),
      },
    ];

    const allocations = allocateFefoBatches(batches, 15, referenceDate);

    expect(allocations).toHaveLength(2);
    expect(allocations[0]).toMatchObject({
      batchCode: 'LOTE-A',
      takenQuantity: 10,
      remainingInBatch: 0,
    });
    expect(allocations[1]).toMatchObject({
      batchCode: 'LOTE-B',
      takenQuantity: 5,
      remainingInBatch: 25,
    });
  });

  it('deve desempatar lotes com a mesma data de validade consumindo o que entrou antes (FIFO)', () => {
    const sameExpiration = new Date('2026-11-15T00:00:00Z');
    const batches: BatchInput[] = [
      {
        id: '2',
        batchCode: 'LOTE-MAIS-NOVO',
        currentQuantity: 10,
        unitCostInCents: 420,
        expirationDate: sameExpiration,
        createdAt: new Date('2026-10-10T10:00:00Z'),
      },
      {
        id: '1',
        batchCode: 'LOTE-MAIS-ANTIGO',
        currentQuantity: 10,
        unitCostInCents: 400,
        expirationDate: sameExpiration,
        createdAt: new Date('2026-10-01T10:00:00Z'),
      },
    ];

    const allocations = allocateFefoBatches(batches, 8, referenceDate);

    expect(allocations).toHaveLength(1);
    expect(allocations[0].batchCode).toBe('LOTE-MAIS-ANTIGO');
    expect(allocations[0].takenQuantity).toBe(8);
    expect(allocations[0].remainingInBatch).toBe(2);
  });

  it('deve ignorar lotes vencidos e alocar apenas de lotes dentro da validade', () => {
    const batches: BatchInput[] = [
      {
        id: '1',
        batchCode: 'LOTE-VENCIDO',
        currentQuantity: 20,
        unitCostInCents: 500,
        expirationDate: new Date('2026-10-24T00:00:00Z'),
        createdAt: new Date('2026-09-01T10:00:00Z'),
      },
      {
        id: '2',
        batchCode: 'LOTE-HOJE',
        currentQuantity: 5,
        unitCostInCents: 510,
        expirationDate: new Date('2026-10-25T00:00:00Z'),
        createdAt: new Date('2026-09-15T10:00:00Z'),
      },
      {
        id: '3',
        batchCode: 'LOTE-FUTURO',
        currentQuantity: 15,
        unitCostInCents: 520,
        expirationDate: new Date('2026-11-10T00:00:00Z'),
        createdAt: new Date('2026-10-01T10:00:00Z'),
      },
    ];

    const allocations = allocateFefoBatches(batches, 12, referenceDate);

    expect(allocations).toHaveLength(2);
    expect(allocations[0].batchCode).toBe('LOTE-HOJE');
    expect(allocations[0].takenQuantity).toBe(5);
    expect(allocations[1].batchCode).toBe('LOTE-FUTURO');
    expect(allocations[1].takenQuantity).toBe(7);
  });

  it('deve lançar InsufficientStockError quando o saldo válido for menor que o solicitado', () => {
    const batches: BatchInput[] = [
      {
        id: '1',
        batchCode: 'LOTE-VENCIDO',
        currentQuantity: 50,
        unitCostInCents: 500,
        expirationDate: new Date('2026-10-01T00:00:00Z'),
        createdAt: new Date('2026-09-01T10:00:00Z'),
      },
      {
        id: '2',
        batchCode: 'LOTE-VALIDO',
        currentQuantity: 10,
        unitCostInCents: 500,
        expirationDate: new Date('2026-11-10T00:00:00Z'),
        createdAt: new Date('2026-10-01T10:00:00Z'),
      },
    ];

    expect(() => allocateFefoBatches(batches, 15, referenceDate)).toThrowError(
      InsufficientStockError
    );
  });

  it('deve lançar InvalidQuantityError se a quantidade solicitada for zero, negativa ou decimal', () => {
    expect(() => allocateFefoBatches([], 0, referenceDate)).toThrowError(
      InvalidQuantityError
    );
    expect(() => allocateFefoBatches([], -5, referenceDate)).toThrowError(
      InvalidQuantityError
    );
    expect(() => allocateFefoBatches([], 2.5, referenceDate)).toThrowError(
      InvalidQuantityError
    );
  });
});