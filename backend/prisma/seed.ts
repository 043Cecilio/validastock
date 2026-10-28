import { prisma } from '../src/lib/prisma';
import { stockService } from '../src/services/stockService';

function addDaysUTC(days: number): Date {
  const now = new Date();
  const utcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return new Date(utcMidnight + days * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log('🧹 Limpando banco de dados...');
  await prisma.stockMovementItem.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  console.log('🌱 Criando categorias e produtos...');
  const laticinios = await stockService.createCategory('Laticínios & Refrigerados');
  const padaria = await stockService.createCategory('Padaria & Confeitaria');
  const mercearia = await stockService.createCategory('Mercearia & Grãos');

  const leite = await stockService.createProduct({
    sku: 'LAT-001',
    name: 'Leite Integral UHT 1L',
    unit: 'UN',
    minStock: 20,
    categoryId: laticinios.id,
  });

  const iogurte = await stockService.createProduct({
    sku: 'LAT-002',
    name: 'Iogurte Natural 170g',
    unit: 'UN',
    minStock: 15,
    categoryId: laticinios.id,
  });

  const paoForma = await stockService.createProduct({
    sku: 'PAD-001',
    name: 'Pão de Forma Tradicional 500g',
    unit: 'PCT',
    minStock: 10,
    categoryId: padaria.id,
  });

  const farinha = await stockService.createProduct({
    sku: 'MER-001',
    name: 'Farinha de Trigo Especial 5kg',
    unit: 'PCT',
    minStock: 8,
    categoryId: mercearia.id,
  });

  console.log('📦 Inserindo lotes com diferentes prazos de validade...');

  await stockService.addBatch({
    productId: leite.id,
    batchCode: 'LOTE-LEITE-A',
    quantity: 10,
    unitCostInCents: 450,
    expirationDate: addDaysUTC(3),
  });

  await stockService.addBatch({
    productId: leite.id,
    batchCode: 'LOTE-LEITE-B',
    quantity: 30,
    unitCostInCents: 480,
    expirationDate: addDaysUTC(25),
  });

  await stockService.addBatch({
    productId: iogurte.id,
    batchCode: 'LOTE-IOG-VENC',
    quantity: 8,
    unitCostInCents: 320,
    expirationDate: addDaysUTC(-2),
  });

  await stockService.addBatch({
    productId: iogurte.id,
    batchCode: 'LOTE-IOG-OK',
    quantity: 25,
    unitCostInCents: 350,
    expirationDate: addDaysUTC(12),
  });

  await stockService.addBatch({
    productId: paoForma.id,
    batchCode: 'LOTE-PAO-01',
    quantity: 18,
    unitCostInCents: 650,
    expirationDate: addDaysUTC(5),
  });

  const lotePaoAvariado = await stockService.addBatch({
    productId: paoForma.id,
    batchCode: 'LOTE-PAO-AVARIA',
    quantity: 5,
    unitCostInCents: 650,
    expirationDate: addDaysUTC(10),
  });

  await stockService.addBatch({
    productId: farinha.id,
    batchCode: 'LOTE-FAR-01',
    quantity: 20,
    unitCostInCents: 1890,
    expirationDate: addDaysUTC(60),
  });

  console.log('🔄 Simulando movimentações iniciais (Consumo FEFO e Perda)...');
  await stockService.withdrawProductFefo(paoForma.id, 5, 'Venda balcão matinal');

  await stockService.registerBatchLoss(
    lotePaoAvariado.id,
    5,
    'Embalagem rasgada no transporte'
  );

  console.log('✅ Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });