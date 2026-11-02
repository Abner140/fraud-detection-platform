
import { useEffect, useRef, useState } from "react"
import { useRealtimeEvents } from "../hooks/useRealtimeEvents"
import type { ReactNode } from "react"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ShieldCheck,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import AppLayout from "../components/AppLayout"
import { api } from "../lib/api"

interface DashboardSummary {
  total_transactions: number
  approved: number
  cancelled: number
  pending: number
  otp_required: number
  avg_fraud_probability: number | null
  max_fraud_probability: number | null
  high_risk: number
  model_version: string | null
  threshold_otp: number | null
}

interface TrendPoint {
  date: string
  total: number
  approved: number
  cancelled: number
  high_risk: number
  avg_fraud_probability: number | null
}

interface DashboardTransaction {
  transaction_id: number
  amount: number
  currency: string
  country: string | null
  timestamp: string
  status: string
  fraud_probability: number | null
  last_decision: string | null
  model_version: string | null
}

function formatCount(value: number | undefined) {
  if (value === undefined) return "—"

  return new Intl.NumberFormat("fr-FR").format(value)
}

function formatAmount(amount: number, currency: string) {
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(amount)} ${currency || "XOF"}`
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    APPROVED: "Approved",
    CANCELLED: "Cancelled",
    PENDING: "Pending",
  }

  return labels[status] ?? status
}

function formatDate(date: string) {
  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) return date

  return parsed.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function Dashboard() {
  const [summary, setSummary] =
    useState<DashboardSummary | null>(null)

  const [trend, setTrend] =
    useState<TrendPoint[]>([])

  const [transactions, setTransactions] =
    useState<DashboardTransaction[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const realtimeEvent = useRealtimeEvents()
  const refreshTimer = useRef<number | null>(null)
  useEffect(() => {
    let active = true

    async function loadDashboard() {
      setIsLoading(true)
      setError(null)

      try {
        const [summaryResponse, trendResponse, transactionsResponse] =
          await Promise.all([
            api.get<DashboardSummary>("/dashboard/summary", {
              params: { days: 365 },
            }),

            api.get<{ data: TrendPoint[] }>("/dashboard/trend", {
              params: { days: 365 },
            }),

            api.get<{ data: DashboardTransaction[] }>(
              "/dashboard/transactions",
              {
                params: {
                  days: 365,
                  limit: 5,
                  status: "ALL",
                },
              },
            ),
          ])

        if (!active) return

        setSummary(summaryResponse.data)
        setTrend(trendResponse.data.data)
        setTransactions(transactionsResponse.data.data)
      } catch (err) {
        console.error("Erreur de chargement du dashboard :", err)

        if (active) {
          setError(
            "Impossible de charger les données. Vérifie que le backend FastAPI fonctionne sur le port 8000.",
          )
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadDashboard()

    return () => {
      active = false
    }
  }, [refreshKey])

  // Refresh dashboard data when relevant WebSocket events arrive.
  useEffect(() => {
    if (!realtimeEvent) return

    const refreshableEvents = new Set<string>([
      "POTENTIAL_FRAUD",
      "OTP_FAILED",
      "OTP_VALIDATED",
      "TRANSACTION_APPROVED",
      "TRANSACTION_CANCELLED",
    ])

    if (!refreshableEvents.has(realtimeEvent.event_type)) {
      return
    }

    // Coalesce events received close together to avoid redundant API calls.
    if (refreshTimer.current !== null) {
      window.clearTimeout(refreshTimer.current)
    }

    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      setRefreshKey((key) => key + 1)
    }, 800)
  }, [realtimeEvent])

  // Clean up the pending refresh timer when the dashboard unmounts.
  useEffect(() => {
    return () => {
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current)
      }
    }
  }, [])

  const chartData = trend.map((point) => ({
    ...point,
    label: new Date(`${point.date}T00:00:00`).toLocaleDateString(
      "fr-FR",
      {
        day: "2-digit",
        month: "short",
      },
    ),
  }))

  return (
    <AppLayout>
      <section className="px-6 pb-10 lg:px-10">
        {/* HERO */}
        <div className="rounded-[28px] bg-gradient-to-br from-[#dfe8f5] via-[#e9f0f8] to-[#d9e4f3] px-7 py-7 shadow-[0_12px_40px_rgba(39,67,104,0.08)]">
          <p className="text-sm font-medium text-slate-500">
            Real-time fraud monitoring
          </p>

          <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-[-0.03em] text-[#162033]">
            Monitor your transaction risk with clarity.
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
            Monitor transaction activity, potential fraud,
            OTP challenges and decision flows from one operational
            workspace.
          </p>
        </div>

        {/* ERROR MESSAGE */}
        {error && (
          <div
            role="alert"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <p>{error}</p>

            <button
              onClick={() => setRefreshKey((key) => key + 1)}
              className="rounded-lg border border-red-200 px-3 py-2 font-semibold hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        )}

        {/* KPI */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            title="Total transactions"
            value={isLoading ? "…" : formatCount(summary?.total_transactions)}
            icon={<Activity size={18} />}
          />

          <KpiCard
            title="High-risk transactions"
            value={isLoading ? "…" : formatCount(summary?.high_risk)}
            icon={<AlertTriangle size={18} />}
          />

          <KpiCard
            title="Approved"
            value={isLoading ? "…" : formatCount(summary?.approved)}
            icon={<CheckCircle2 size={18} />}
          />

          <KpiCard
            title="Cancelled"
            value={isLoading ? "…" : formatCount(summary?.cancelled)}
            icon={<CircleDollarSign size={18} />}
          />

          <KpiCard
            title="Pending"
            value={isLoading ? "…" : formatCount(summary?.pending)}
            icon={<Clock3 size={18} />}
          />

          <KpiCard
            title="OTP required"
            value={isLoading ? "…" : formatCount(summary?.otp_required)}
            icon={<ShieldCheck size={18} />}
          />
        </div>

        {/* CHART AND RECENT ACTIVITY */}
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-[#182230]">
                  Transaction performance
                </h3>

                <p className="mt-1 text-xs text-slate-400">
                  Daily transaction volume · Last 365 days
                </p>
              </div>

              <button
                onClick={() => setRefreshKey((key) => key + 1)}
                disabled={isLoading}
                className="rounded-xl bg-[#2864e8] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {isLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            <div className="mt-8 h-[280px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid
                      vertical={false}
                      stroke="#edf1f6"
                    />

                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: "#94a3b8",
                        fontSize: 11,
                      }}
                    />

                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      tick={{
                        fill: "#94a3b8",
                        fontSize: 11,
                      }}
                    />

                    <Tooltip />

                    <Bar
                      dataKey="total"
                      name="Transactions"
                      radius={[12, 12, 0, 0]}
                      fill="#2864e8"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  {isLoading
                    ? "Loading transaction data..."
                    : "No transaction data for this period."}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <h3 className="font-semibold text-[#182230]">
              Recent risk activity
            </h3>

            <p className="mt-1 text-xs text-slate-400">
              Latest transactions from the backend
            </p>

            <div className="mt-6 space-y-4">
              {transactions.length > 0 ? (
                transactions.map((transaction) => {
                  const probability = transaction.fraud_probability

                  return (
                    <div
                      key={transaction.transaction_id}
                      className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700">
                          Transaction #{transaction.transaction_id}
                        </p>

                        <p className="mt-1 text-[10px] text-slate-400">
                          {formatStatus(transaction.status)}
                          {" · "}
                          {formatDate(transaction.timestamp)}
                        </p>

                        {probability !== null && (
                          <p
                            className={`mt-1 text-[10px] font-medium ${
                              probability >= 0.3
                                ? "text-red-600"
                                : "text-slate-400"
                            }`}
                          >
                            Risk probability:{" "}
                            {(probability * 100).toFixed(1)}%
                          </p>
                        )}
                      </div>

                      <p className="shrink-0 text-xs font-semibold text-[#182230]">
                        {formatAmount(
                          transaction.amount,
                          transaction.currency,
                        )}
                      </p>
                    </div>
                  )
                })
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">
                  {isLoading
                    ? "Loading transactions..."
                    : "No recent transactions found."}
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="mt-5 text-xs text-slate-400">
          Statistics cover the last 365 days. High risk means a fraud
          probability of at least 30%; it does not confirm fraud.
        </p>
      </section>
    </AppLayout>
  )
}

function KpiCard({
  title,
  value,
  icon,
}: {
  title: string
  value: string
  icon: ReactNode
}) {
  return (
    <div className="rounded-[24px] bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400">
            {title}
          </p>

          <p className="mt-2 text-[1.45rem] font-bold tracking-tight text-[#172033]">
            {value}
          </p>

          <p className="mt-1 text-[10px] text-[#2864e8]">
            Last 365 days
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#e9f0ff] text-[#2864e8]">
          {icon}
        </div>
      </div>
    </div>
  )
}
