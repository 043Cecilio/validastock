export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class InsufficientStockError extends DomainError {
  constructor(
    public readonly requested: number,
    public readonly available: number
  ) {
    super(
      `Estoque válido insuficiente. Solicitado: ${requested}, Disponível (não vencido): ${available}.`
    );
    this.name = 'InsufficientStockError';
  }
}

export class InvalidQuantityError extends DomainError {
  constructor() {
    super('A quantidade solicitada deve ser um número inteiro maior que zero.');
    this.name = 'InvalidQuantityError';
  }
}