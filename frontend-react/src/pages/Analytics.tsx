import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  AlertTriangle,
  CircleDollarSign,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
} from "lucide-react"

import AppLayout from "../components/AppLayout"
import { api } from "../lib/api"

type TrendPoint = {
  date: string
  total: number
  approved: number
  cancelled: number
  high_risk: number
  avg_fraud_probability: number | null
}

type ApiTransaction = {
  transaction_id: number
  amount: number
  currency?: string
  country?: string
  timestamp: string
  status: string
  fraud_probability?: number | null
  last_decision?: string | null
}

type Transaction = ApiTransaction & {
  score: number | null
}

type Summary = {
  total_transactions?: number
  total?: number
  approved?: number
  cancelled?: number
  pending?: number
  otp_required?: number
  high_risk?: number
  avg_fraud_probability?: number
  model_version?: string
}

const COLORS = ["#2864e8", "#e76f51", "#94a3b8", "#b7c8e5"]

const PERIODS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 365 days", days: 365 },
]

function formatAmount(value: number, currency = "XOF") {
  return `${value.toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
  })} ${currency}`
}

function getRows<T>(response: { data: unknown }): T[] {
  if (Array.isArray(response.data)) return response.data as T[]

  if (
    response.data &&
    typeof response.data === "object" &&
    "data" in response.data &&
    Array.isArray((response.data as { data: unknown }).data)
  ) {
    return (response.data as { data: T[] }).data
  }

  return []
}

export default function Analytics() {
  const [period, setPeriod] = useState(90)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError("")

    try {
      const [summaryResponse, trendResponse, transactionsResponse] =
        await Promise.all([
          api.get("/dashboard/summary", { params: { days: period } }),
          api.get("/dashboard/trend", { params: { days: period } }),
          api.get("/dashboard/transactions", {
            params: { days: period, limit: 500, status: "ALL" },
          }),
        ])

      setSummary(summaryResponse.data as Summary)

      const trendRows = getRows<TrendPoint>(trendResponse)
      setTrend(
        trendRows
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
      )

      const transactionRows = getRows<ApiTransaction>(transactionsResponse)
      setTransactions(
        transactionRows.map((item) => ({
          ...item,
          score:
            typeof item.fraud_probability === "number"
              ? item.fraud_probability
              : null,
        }))
      )
    } catch (err) {
      console.error("Analytics loading failed:", err)
      setError(
        "Impossible de charger les analyses. Vérifie que l'API FastAPI fonctionne."
      )
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void loadAnalytics()
  }, [loadAnalytics])

  const totalTransactions = useMemo(() => {
    if (trend.length > 0) {
      return trend.reduce((sum, item) => sum + (item.total || 0), 0)
    }

    return summary?.total_transactions ?? summary?.total ?? transactions.length
  }, [trend, summary, transactions.length])

  const highRiskCount = useMemo(() => {
    if (trend.length > 0) {
      return trend.reduce((sum, item) => sum + (item.high_risk || 0), 0)
    }

    return summary?.high_risk ?? summary?.otp_required ?? 0
  }, [trend, summary])

  const fraudRate =
    totalTransactions > 0 ? (highRiskCount / totalTransactions) * 100 : 0

  const riskAmount = useMemo(
    () =>
      transactions.reduce((sum, item) => {
        return item.score !== null && item.score >= 0.3
          ? sum + (Number(item.amount) || 0)
          : sum
      }, 0),
    [transactions]
  )

  const riskDistribution = useMemo(() => {
    const highRisk = transactions.filter(
      (item) => item.score !== null && item.score >= 0.3
    ).length
    const lowRisk = transactions.filter(
      (item) => item.score !== null && item.score < 0.3
    ).length
    const unknown = transactions.filter((item) => item.score === null).length

    return [
      { name: "Lower score", value: lowRisk },
      { name: "Higher score", value: highRisk },
      { name: "Unknown score", value: unknown },
    ].filter((item) => item.value > 0)
  }, [transactions])

  const statusDistribution = useMemo(() => {
    const counts = new Map<string, number>()

    transactions.forEach((item) => {
      const key = item.status || "UNKNOWN"
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })

    return [...counts.entries()].map(([status, count]) => ({
      status,
      count,
    }))
  }, [transactions])

  const countryDistribution = useMemo(() => {
    const counts = new Map<string, number>()

    transactions.forEach((item) => {
      const key = item.country || "Unknown"
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })

    return [...counts.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [transactions])

  const riskByCountry = useMemo(() => {
    const counts = new Map<string, { highRisk: number; other: number }>()

    transactions.forEach((item) => {
      const country = item.country || "Unknown"
      const entry = counts.get(country) ?? { highRisk: 0, other: 0 }

      if (item.score !== null && item.score >= 0.3) {
        entry.highRisk += 1
      } else {
        entry.other += 1
      }

      counts.set(country, entry)
    })

    return [...counts.entries()]
      .map(([country, values]) => ({
        country,
        ...values,
      }))
      .sort((a, b) => b.highRisk - a.highRisk)
      .slice(0, 10)
  }, [transactions])

  const chartTrend = useMemo(
    () =>
      trend.map((item) => ({
        date: item.date,
        transactions: item.total || 0,
        highRisk: item.high_risk || 0,
      })),
    [trend]
  )

  return (
    <AppLayout>
      <section className="px-6 pb-10 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">Risk intelligence</p>
            <h2 className="mt-1 text-3xl font-bold tracking-[-0.03em] text-[#162033]">
              Analytics
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Analyse des volumes, des statuts et des scores de risque issus du backend.
            </p>
          </div>

          <button
            onClick={() => void loadAnalytics()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Actualiser
          </button>
        </div>

        <div className="mt-6 rounded-[28px] bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Analysis period</p>
              <p className="mt-1 text-xs text-slate-400">
                Choisis la période d'analyse
              </p>
            </div>

            <select
              value={period}
              onChange={(event) => setPeriod(Number(event.target.value))}
              className="rounded-2xl border border-slate-200 bg-[#f8fafc] px-4 py-2.5 text-xs font-medium text-slate-700 outline-none"
              aria-label="Période d'analyse"
            >
              {PERIODS.map((item) => (
                <option key={item.days} value={item.days}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={18} className="shrink-0" />
            <div>
              <p className="font-semibold">Erreur de chargement</p>
              <p className="mt-1">{error}</p>
              <button
                onClick={() => void loadAnalytics()}
                className="mt-2 font-semibold underline"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AnalyticsCard
            title="Total transactions"
            value={loading && !summary ? "…" : totalTransactions.toLocaleString("fr-FR")}
            subtitle={`Sur ${period} jours`}
            icon={<Activity size={18} />}
          />
          <AnalyticsCard
            title="Transactions à risque élevé"
            value={loading && !summary ? "…" : highRiskCount.toLocaleString("fr-FR")}
            subtitle="Seuil de score ≥ 30 %"
            icon={<AlertTriangle size={18} />}
          />
          <AnalyticsCard
            title="Taux de risque élevé"
            value={loading && !summary ? "…" : `${fraudRate.toFixed(2)}%`}
            subtitle="Part des transactions signalées à risque"
            icon={<ShieldCheck size={18} />}
          />
          <AnalyticsCard
            title="Montant des transactions à risque"
            value={loading && !summary ? "…" : formatAmount(riskAmount)}
            subtitle="Somme des transactions avec score ≥ 30 % dans les données chargées"
            icon={<CircleDollarSign size={18} />}
          />
        </div>

        <div className="mt-6 rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <h3 className="font-semibold text-[#182230]">
            Évolution du volume et du risque
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Comptages quotidiens renvoyés par le backend.
          </p>

          <div className="mt-6 h-[320px]">
            {chartTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartTrend}>
                  <CartesianGrid vertical={false} stroke="#edf1f6" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="transactions" name="Transactions" stroke="#2864e8" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="highRisk" name="Risque élevé" stroke="#e76f51" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty loading={loading} />
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_1fr]">
          <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <h3 className="font-semibold">Transactions par pays</h3>
            <p className="mt-1 text-xs text-slate-400">
              Répartition calculée à partir des transactions chargées.
            </p>
            <div className="mt-6 h-[280px]">
              {countryDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={countryDistribution}>
                    <CartesianGrid vertical={false} stroke="#edf1f6" />
                    <XAxis dataKey="country" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Transactions" fill="#2864e8" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty loading={loading} />
              )}
            </div>
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <h3 className="font-semibold">Distribution des scores</h3>
            <p className="mt-1 text-xs text-slate-400">
              Classification indicative selon le seuil de 30 %.
            </p>
            <div className="mt-4 h-[280px]">
              {riskDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="48%"
                      innerRadius={72}
                      outerRadius={105}
                      paddingAngle={3}
                    >
                      {riskDistribution.map((item, index) => (
                        <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty loading={loading} />
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-5 text-xs">
              {riskDistribution.map((item) => (
                <div key={item.name}>
                  <p className="text-slate-400">{item.name}</p>
                  <p className="mt-1 font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <h3 className="font-semibold">Transactions par statut</h3>
            <p className="mt-1 text-xs text-slate-400">
              Répartition des statuts présents dans les données chargées.
            </p>
            <div className="mt-6 h-[280px]">
              {statusDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusDistribution}>
                    <CartesianGrid vertical={false} stroke="#edf1f6" />
                    <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Transactions" fill="#9eb4d8" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty loading={loading} />
              )}
            </div>
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <h3 className="font-semibold">Risque par pays</h3>
            <p className="mt-1 text-xs text-slate-400">
              Scores ≥ 30 % comparés aux autres scores connus ou faibles.
            </p>
            <div className="mt-6 h-[280px]">
              {riskByCountry.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskByCountry}>
                    <CartesianGrid vertical={false} stroke="#edf1f6" />
                    <XAxis dataKey="country" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="other" name="Score inférieur ou inconnu" stackId="a" fill="#b7c8e5" />
                    <Bar dataKey="highRisk" name="Score élevé" stackId="a" fill="#e76f51" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty loading={loading} />
              )}
            </div>
          </div>
        </div>

        <p className="mt-5 text-xs text-slate-400">
          Modèle : {summary?.model_version || "Non communiqué par l'API"}.
          Les répartitions par pays et par score sont calculées à partir des transactions renvoyées par l'endpoint, limitées à 500 lignes.
        </p>
      </section>
    </AppLayout>
  )
}

function ChartEmpty({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      {loading ? "Chargement des données…" : "Aucune donnée disponible pour cette période."}
    </div>
  )
}

function AnalyticsCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string
  value: string
  subtitle: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-[24px] bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">{title}</p>
          <p className="mt-2 text-[1.45rem] font-bold tracking-tight text-[#172033]">
            {value}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">{subtitle}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#e9f0ff] text-[#2864e8]">
          {icon}
        </div>
      </div>
    </div>
  )
}
