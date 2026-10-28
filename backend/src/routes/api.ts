import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { stockService } from '../services/stockService';
import { alertService } from '../services/alertService';
import { DomainError } from '../domain/errors';

export const apiRouter = Router();

const categorySchema = z.object({
  name: z.string().min(2, 'O nome da categoria deve ter pelo menos 2 caracteres.'),
});

const productSchema = z.object({
  sku: z.string().min(2, 'SKU é obrigatório.'),
  name: z.string().min(2, 'Nome é obrigatório.'),
  unit: z.string().min(1, 'Unidade (UN, KG, L, CX) é obrigatória.'),
  minStock: z.number().int().min(0).default(0),
  categoryId: z.string().uuid('ID de categoria inválido.'),
});

const batchSchema = z.object({
  productId: z.string().uuid('ID de produto inválido.'),
  batchCode: z.string().min(1, 'Código do lote é obrigatório.'),
  quantity: z.number().int().positive('A quantidade deve ser maior que zero.'),
  unitCostInCents: z.number().int().min(0, 'O custo em centavos não pode ser negativo.'),
  expirationDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Data de validade inválida. Use o formato YYYY-MM-DD.',
  }),
});

const fefoWithdrawSchema = z.object({
  productId: z.string().uuid('ID de produto inválido.'),
  quantity: z.number().int().positive('A quantidade deve ser maior que zero.'),
  reason: z.string().optional(),
});

const lossWithdrawSchema = z.object({
  batchId: z.string().uuid('ID do lote inválido.'),
  quantity: z.number().int().positive('A quantidade deve ser maior que zero.'),
  reason: z.string().min(3, 'Informe o motivo da perda (ex: Vencimento, Avaria).'),
});

apiRouter.get('/categories', async (_req, res, next) => {
  try {
    const categories = await stockService.listCategories();
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/categories', async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body);
    const category = await stockService.createCategory(data.name);
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/products', async (_req, res, next) => {
  try {
    const products = await stockService.listProducts();
    res.json(products);
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/products', async (req, res, next) => {
  try {
    const data = productSchema.parse(req.body);
    const product = await stockService.createProduct(data);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/batches', async (req, res, next) => {
  try {
    const data = batchSchema.parse(req.body);
    const batch = await stockService.addBatch({
      ...data,
      expirationDate: new Date(`${data.expirationDate}T00:00:00.000Z`),
    });
    res.status(201).json(batch);
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/stock/fefo-preview', async (req, res, next) => {
  try {
    const data = fefoWithdrawSchema.parse(req.body);
    const allocations = await stockService.previewFefoWithdrawal(
      data.productId,
      data.quantity
    );
    res.json({ allocations });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/stock/withdraw-fefo', async (req, res, next) => {
  try {
    const data = fefoWithdrawSchema.parse(req.body);
    const result = await stockService.withdrawProductFefo(
      data.productId,
      data.quantity,
      data.reason
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/stock/withdraw-loss', async (req, res, next) => {
  try {
    const data = lossWithdrawSchema.parse(req.body);
    const movement = await stockService.registerBatchLoss(
      data.batchId,
      data.quantity,
      data.reason
    );
    res.status(201).json(movement);
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/alerts/expiration', async (_req, res, next) => {
  try {
    const dashboard = await alertService.getExpirationDashboard();
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/reports/financial', async (_req, res, next) => {
  try {
    const report = await alertService.getFinancialLossReport();
    res.json(report);
  } catch (err) {
    next(err);
  }
});

apiRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: 'Erro de validação nos dados enviados.',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  if (err instanceof DomainError) {
    res.status(422).json({
      error: err.name,
      message: err.message,
    });
    return;
  }

  console.error('Erro interno:', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});