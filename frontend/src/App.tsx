import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  PackagePlus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';

const API_URL = 'http://localhost:3333/api';

interface BatchAlert {
  id: string;
  batchCode: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  categoryName: string;
  currentQuantity: number;
  unitCostInCents: number;
  totalValueInCents: number;
  expirationDate: string;
  daysUntilExpiration: number;
}

interface ExpirationDashboard {
  summary: {
    expiredCount: number;
    expiredValueInCents: number;
    within7DaysCount: number;
    risk7DaysValueInCents: number;
    within15DaysCount: number;
    risk15DaysValueInCents: number;
    within30DaysCount: number;
    risk30DaysValueInCents: number;
  };
  buckets: {
    expired: BatchAlert[];
    within7Days: BatchAlert[];
    within15Days: BatchAlert[];
    within30Days: BatchAlert[];
  };
}

interface Product {
  id: string;
  sku: string;
  name: string;
  unit: string;
  minStock: number;
  validStock: number;
  expiredStock: number;
  isLowStock: boolean;
  category: { name: string };
  batches: Array<{
    id: string;
    batchCode: string;
    currentQuantity: number;
    unitCostInCents: number;
    expirationDate: string;
  }>;
}

interface FefoAllocation {
  batchId: string;
  batchCode: string;
  takenQuantity: number;
  remainingInBatch: number;
  unitCostInCents: number;
  expirationDate: string;
}

interface FinancialReport {
  metrics: {
    totalConsumptionValueInCents: number;
    totalConsumptionUnits: number;
    totalRegisteredLossValueInCents: number;
    totalRegisteredLossUnits: number;
    lossPercentage: number;
  };
  recentMovements: Array<{
    id: string;
    type: 'IN' | 'OUT_CONSUMPTION' | 'OUT_LOSS';
    totalQuantity: number;
    reason: string;
    createdAt: string;
    product: { name: string; unit: string };
    items: Array<{
      id: string;
      quantity: number;
      unitCostInCents: number;
      batch: { batchCode: string };
    }>;
  }>;
}

const formatCurrency = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
};

export function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [alerts, setAlerts] = useState<ExpirationDashboard | null>(null);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBucket, setActiveBucket] = useState<
    'expired' | 'within7Days' | 'within15Days' | 'within30Days'
  >('within7Days');

  // Estado do Simulador / Baixa FEFO
  const [selectedProductId, setSelectedProductId] = useState('');
  const [withdrawQty, setWithdrawQty] = useState(15);
  const [withdrawReason, setWithdrawReason] = useState('Venda / Consumo balcão');
  const [previewAllocations, setPreviewAllocations] = useState<FefoAllocation[] | null>(
    null
  );
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Estado para Entrada de Novo Lote
  const [newBatchProductId, setNewBatchProductId] = useState('');
  const [newBatchCode, setNewBatchCode] = useState('');
  const [newBatchQty, setNewBatchQty] = useState(20);
  const [newBatchCostBRL, setNewBatchCostBRL] = useState('4.90');
  const [newBatchExpDate, setNewBatchExpDate] = useState('');

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [prodRes, alertRes, repRes] = await Promise.all([
        fetch(`${API_URL}/products`),
        fetch(`${API_URL}/alerts/expiration`),
        fetch(`${API_URL}/reports/financial`),
      ]);
      const prodData: Product[] = await prodRes.json();
      const alertData: ExpirationDashboard = await alertRes.json();
      const repData: FinancialReport = await repRes.json();

      setProducts(prodData);
      setAlerts(alertData);
      setReport(repData);

      if (prodData.length > 0 && !selectedProductId) {
        setSelectedProductId(prodData[0].id);
        setNewBatchProductId(prodData[0].id);
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Não foi possível conectar à API em http://localhost:3333',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Simular alocação FEFO
  const handlePreviewFefo = async () => {
    setFeedback(null);
    setPreviewAllocations(null);
    try {
      const res = await fetch(`${API_URL}/stock/fefo-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductId,
          quantity: Number(withdrawQty),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || data.error });
        return;
      }
      setPreviewAllocations(data.allocations);
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao simular alocação FEFO.' });
    }
  };

  // Confirmar Baixa FEFO
  const handleConfirmFefo = async () => {
    setFeedback(null);
    try {
      const res = await fetch(`${API_URL}/stock/withdraw-fefo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductId,
          quantity: Number(withdrawQty),
          reason: withdrawReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || data.error });
        return;
      }
      setPreviewAllocations(null);
      setFeedback({
        type: 'success',
        message: `Baixa FEFO concluída! Consumidos ${data.allocations.length} lote(s) na ordem exata de validade.`,
      });
      fetchAllData();
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao confirmar saída FEFO.' });
    }
  };

  // Dar baixa de perda/vencimento em um lote específico
  const handleDiscardBatch = async (batch: BatchAlert) => {
    setFeedback(null);
    try {
      const res = await fetch(`${API_URL}/stock/withdraw-loss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          quantity: batch.currentQuantity,
          reason:
            batch.daysUntilExpiration < 0
              ? `Descarte por vencimento (${batch.batchCode})`
              : `Baixa preventiva por avaria/risco (${batch.batchCode})`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || data.error });
        return;
      }
      setFeedback({
        type: 'success',
        message: `Lote ${batch.batchCode} descartado como perda e registrado na auditoria financeira.`,
      });
      fetchAllData();
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao registrar perda do lote.' });
    }
  };

  // Cadastrar Novo Lote
  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const unitCostInCents = Math.round(
      parseFloat(newBatchCostBRL.replace(',', '.')) * 100
    );

    try {
      const res = await fetch(`${API_URL}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: newBatchProductId,
          batchCode: newBatchCode,
          quantity: Number(newBatchQty),
          unitCostInCents,
          expirationDate: newBatchExpDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || data.error });
        return;
      }
      setNewBatchCode('');
      setFeedback({
        type: 'success',
        message: `Novo lote ${data.batchCode} registrado com sucesso!`,
      });
      fetchAllData();
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao cadastrar lote.' });
    }
  };

  const currentBucketList = alerts ? alerts.buckets[activeBucket] : [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Cabeçalho */}
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 p-2 rounded-lg text-slate-950">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ValidaStock</h1>
              <p className="text-xs text-slate-400">
                Controle de Estoque Perecível por Lote, Regra FEFO & Prevenção de Perdas
              </p>
            </div>
          </div>
          <button
            onClick={fetchAllData}
            className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 px-3.5 py-2 rounded-lg border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar Dados
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Banner de Feedback */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs underline opacity-75 hover:opacity-100 cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {/* 1. Painel de Risco de Vencimento (Vencidos, 7, 15, 30 dias) */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-amber-600" />
              Painel de Alertas de Vencimento (Clique para filtrar)
            </h2>
            {report && (
              <div className="flex items-center gap-4 text-xs bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-xs">
                <span>
                  Consumo FEFO:{' '}
                  <strong className="text-emerald-700">
                    {formatCurrency(report.metrics.totalConsumptionValueInCents)}
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Perdas Registradas:{' '}
                  <strong className="text-red-600">
                    {formatCurrency(report.metrics.totalRegisteredLossValueInCents)} (
                    {report.metrics.lossPercentage}%)
                  </strong>
                </span>
              </div>
            )}
          </div>

          {alerts && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => setActiveBucket('expired')}
                className={`text-left p-5 rounded-xl border transition cursor-pointer ${
                  activeBucket === 'expired'
                    ? 'bg-red-50 border-red-400 ring-2 ring-red-200'
                    : 'bg-white border-slate-200 hover:border-red-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                    Vencidos (Bloqueados)
                  </span>
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                </div>
                <p className="text-3xl font-extrabold mt-3 text-slate-900">
                  {alerts.summary.expiredCount}{' '}
                  <span className="text-sm font-normal text-slate-500">lote(s)</span>
                </p>
                <p className="text-xs text-red-700 font-medium mt-1">
                  Prejuízo retido: {formatCurrency(alerts.summary.expiredValueInCents)}
                </p>
              </button>

              <button
                onClick={() => setActiveBucket('within7Days')}
                className={`text-left p-5 rounded-xl border transition cursor-pointer ${
                  activeBucket === 'within7Days'
                    ? 'bg-orange-50 border-orange-400 ring-2 ring-orange-200'
                    : 'bg-white border-slate-200 hover:border-orange-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-orange-800 bg-orange-100 px-2.5 py-1 rounded-full">
                    Crítico (0 a 7 dias)
                  </span>
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                </div>
                <p className="text-3xl font-extrabold mt-3 text-slate-900">
                  {alerts.summary.within7DaysCount}{' '}
                  <span className="text-sm font-normal text-slate-500">lote(s)</span>
                </p>
                <p className="text-xs text-orange-800 font-medium mt-1">
                  Valor em risco: {formatCurrency(alerts.summary.risk7DaysValueInCents)}
                </p>
              </button>

              <button
                onClick={() => setActiveBucket('within15Days')}
                className={`text-left p-5 rounded-xl border transition cursor-pointer ${
                  activeBucket === 'within15Days'
                    ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200'
                    : 'bg-white border-slate-200 hover:border-amber-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full">
                    Alerta (8 a 15 dias)
                  </span>
                  <CalendarClock className="w-5 h-5 text-amber-500" />
                </div>
                <p className="text-3xl font-extrabold mt-3 text-slate-900">
                  {alerts.summary.within15DaysCount}{' '}
                  <span className="text-sm font-normal text-slate-500">lote(s)</span>
                </p>
                <p className="text-xs text-amber-800 font-medium mt-1">
                  Valor em risco: {formatCurrency(alerts.summary.risk15DaysValueInCents)}
                </p>
              </button>

              <button
                onClick={() => setActiveBucket('within30Days')}
                className={`text-left p-5 rounded-xl border transition cursor-pointer ${
                  activeBucket === 'within30Days'
                    ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200'
                    : 'bg-white border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full">
                    Atenção (16 a 30 dias)
                  </span>
                  <CalendarClock className="w-5 h-5 text-blue-500" />
                </div>
                <p className="text-3xl font-extrabold mt-3 text-slate-900">
                  {alerts.summary.within30DaysCount}{' '}
                  <span className="text-sm font-normal text-slate-500">lote(s)</span>
                </p>
                <p className="text-xs text-blue-800 font-medium mt-1">
                  Valor monitorado: {formatCurrency(alerts.summary.risk30DaysValueInCents)}
                </p>
              </button>
            </div>
          )}

          {/* Tabela da faixa selecionada */}
          <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Lotes na faixa selecionada ({currentBucketList.length})
              </span>
            </div>
            {currentBucketList.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">
                Nenhum lote encontrado nesta faixa de vencimento.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3">Lote</th>
                      <th className="px-5 py-3">Produto</th>
                      <th className="px-5 py-3">Saldo Atual</th>
                      <th className="px-5 py-3">Validade</th>
                      <th className="px-5 py-3">Valor em Estoque</th>
                      <th className="px-5 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentBucketList.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono font-semibold text-slate-800">
                          {item.batchCode}
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900">
                            {item.productName}
                          </div>
                          <div className="text-xs text-slate-400">
                            {item.sku} • {item.categoryName}
                          </div>
                        </td>
                        <td className="px-5 py-3 font-semibold">
                          {item.currentQuantity} {item.unit}
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-medium">
                            {formatDate(item.expirationDate)}
                          </span>
                          <span
                            className={`ml-2 text-xs px-2 py-0.5 rounded-full font-semibold ${
                              item.daysUntilExpiration < 0
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.daysUntilExpiration < 0
                              ? `Vencido há ${Math.abs(item.daysUntilExpiration)}d`
                              : `Vence em ${item.daysUntilExpiration}d`}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-medium">
                          {formatCurrency(item.totalValueInCents)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => handleDiscardBatch(item)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Baixar Perda
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* 2. Grid Principal: Simulador FEFO + Entrada de Lote */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Simulador e Saída Inteligente FEFO */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-base mb-1">
                <Sparkles className="w-5 h-5" />
                <h2>Saída Inteligente com Simulador FEFO</h2>
              </div>
              <p className="text-xs text-slate-500 mb-5">
                O algoritmo consome automaticamente os lotes que vencem antes e ignora
                lotes vencidos.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Produto
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      setPreviewAllocations(null);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}) — Saldo Válido: {p.validStock} {p.unit}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                      Quantidade de Saída
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={withdrawQty}
                      onChange={(e) => {
                        setWithdrawQty(Number(e.target.value));
                        setPreviewAllocations(null);
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                      Motivo / Destino
                    </label>
                    <input
                      type="text"
                      value={withdrawReason}
                      onChange={(e) => setWithdrawReason(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handlePreviewFefo}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm py-2.5 px-4 rounded-lg border border-slate-300 transition cursor-pointer"
                  >
                    1. Simular Alocação FEFO
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmFefo}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm py-2.5 px-4 rounded-lg transition cursor-pointer"
                  >
                    2. Confirmar Baixa FEFO
                  </button>
                </div>
              </div>

              {/* Resultado da Simulação FEFO */}
              {previewAllocations && (
                <div className="mt-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-xs font-bold uppercase text-emerald-900 mb-2">
                    Plano de Retirada Calculado pelo Algoritmo FEFO:
                  </p>
                  <ul className="space-y-2 text-sm">
                    {previewAllocations.map((alloc, idx) => (
                      <li
                        key={alloc.batchId}
                        className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-emerald-100"
                      >
                        <span>
                          <strong>{idx + 1}º</strong> Retirar{' '}
                          <strong className="text-emerald-700">
                            {alloc.takenQuantity} un.
                          </strong>{' '}
                          do lote <code className="font-bold">{alloc.batchCode}</code>
                        </span>
                        <span className="text-xs text-slate-500">
                          Vence: {formatDate(alloc.expirationDate)} (Restará:{' '}
                          {alloc.remainingInBatch})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Entrada de Novo Lote */}
          <form
            onSubmit={handleAddBatch}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4"
          >
            <div>
              <div className="flex items-center gap-2 text-blue-700 font-bold text-base mb-1">
                <PackagePlus className="w-5 h-5" />
                <h2>Entrada de Novo Lote</h2>
              </div>
              <p className="text-xs text-slate-500">
                Cadastre um novo lote recebido com sua data de validade e custo unitário.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Produto
              </label>
              <select
                value={newBatchProductId}
                onChange={(e) => setNewBatchProductId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Código do Lote
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: LOTE-2026-X"
                  value={newBatchCode}
                  onChange={(e) => setNewBatchCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Data de Validade
                </label>
                <input
                  type="date"
                  required
                  value={newBatchExpDate}
                  onChange={(e) => setNewBatchExpDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Quantidade Recebida
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={newBatchQty}
                  onChange={(e) => setNewBatchQty(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Custo Unitário (R$)
                </label>
                <input
                  type="text"
                  required
                  value={newBatchCostBRL}
                  onChange={(e) => setNewBatchCostBRL(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 px-4 rounded-lg transition cursor-pointer"
            >
              Registrar Entrada de Lote
            </button>
          </form>
        </div>

        {/* 3. Visão Geral de Produtos e Lotes Ativos */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-bold text-base">
              Estoque Consolidado por Produto & Lotes Ativos
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Produto</th>
                  <th className="px-6 py-3">Saldo Válido</th>
                  <th className="px-6 py-3">Saldo Vencido</th>
                  <th className="px-6 py-3">Lotes na Prateleira (Ordem FEFO)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{product.name}</div>
                      <div className="text-xs text-slate-400">
                        SKU: {product.sku} • Mínimo: {product.minStock} {product.unit}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`font-bold ${
                          product.isLowStock ? 'text-amber-600' : 'text-emerald-700'
                        }`}
                      >
                        {product.validStock} {product.unit}
                      </span>
                      {product.isLowStock && (
                        <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                          Abaixo do mínimo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {product.expiredStock > 0 ? (
                        <span className="font-bold text-red-600">
                          {product.expiredStock} {product.unit} (Bloqueado)
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {product.batches.map((b) => (
                          <span
                            key={b.id}
                            className="text-xs bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md font-mono"
                          >
                            <strong>{b.batchCode}</strong>: {b.currentQuantity} un. (Val:{' '}
                            {formatDate(b.expirationDate)})
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. Últimas Movimentações (Auditoria) */}
        {report && (
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-bold text-base">
                Histórico Recente de Movimentações (Auditoria de Lotes)
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {report.recentMovements.slice(0, 8).map((mov) => (
                <div
                  key={mov.id}
                  className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    {mov.type === 'IN' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full">
                        <ArrowDownRight className="w-3.5 h-3.5" /> ENTRADA
                      </span>
                    )}
                    {mov.type === 'OUT_CONSUMPTION' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
                        <ArrowUpRight className="w-3.5 h-3.5" /> SAÍDA FEFO
                      </span>
                    )}
                    {mov.type === 'OUT_LOSS' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold bg-red-100 text-red-800 px-2.5 py-1 rounded-full">
                        <Trash2 className="w-3.5 h-3.5" /> PERDA / DESCARTE
                      </span>
                    )}
                    <div>
                      <span className="font-semibold">{mov.product.name}</span> —{' '}
                      <span>
                        {mov.totalQuantity} {mov.product.unit}
                      </span>
                      <span className="text-xs text-slate-400 ml-2">({mov.reason})</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {mov.items.map((item) => (
                      <span
                        key={item.id}
                        className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700"
                      >
                        {item.batch.batchCode}: {item.quantity}x (
                        {formatCurrency(item.unitCostInCents)})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;