
import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Bell,
  Clock3,
  ShieldAlert,
  CircleDollarSign,
  RefreshCw,
} from "lucide-react"

import AppLayout from "../components/AppLayout"
import { api } from "../lib/api"

type Transaction = {
  transaction_id: number
  amount: number
  currency?: string
  country?: string
  timestamp?: string
  status?: string
  fraud_probability?: number | string | null
  last_decision?: string | null
  model_version?: string | null
}

type AuditEvent = {
  audit_id?: number
  transaction_id: number
  event_type: string
  service?: string
  timestamp?: string
  details?: Record<string, unknown> | string | null
}

type ApiPayload<T> = {
  data?: T[]
  transactions?: T[]
  events?: T[]
  items?: T[]
}

function getRows<T>(payload: T[] | ApiPayload<T> | null | undefined): T[] {
  if (Array.isArray(payload)) return payload

  if (payload && typeof payload === "object") {
    const result = payload as ApiPayload<T>
    return result.data ?? result.transactions ?? result.events ?? result.items ?? []
  }

  return []
}

function getScore(transaction: Transaction): number | null {
  const value = transaction.fraud_probability

  if (value === null || value === undefined || value === "") return null

  const score = Number(value)
  if (!Number.isFinite(score)) return null

  // Accepte aussi bien 0.72 que 72.
  return score > 1 ? score / 100 : score
}

function formatPercent(value: number | null): string {
  return value === null ? "N/D" : `${(value * 100).toFixed(1)}%`
}

function formatAmount(amount: number, currency = "XOF"): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(amount) + ` ${currency}`
}

function formatDate(value?: string): string {
  if (!value) return "Date inconnue"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Date inconnue"

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function formatTime(value?: string): string {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function getAuditDetails(event: AuditEvent): string {
  if (typeof event.details === "string") {
    try {
      const parsed = JSON.parse(event.details) as Record<string, unknown>
      const message = parsed.message ?? parsed.reason ?? parsed.decision
      return message ? String(message) : ""
    } catch {
      return event.details
    }
  }

  if (event.details && typeof event.details === "object") {
    const details = event.details
    const message = details.message ?? details.reason ?? details.decision
    return message ? String(message) : ""
  }

  return ""
}

function getEventLabel(type: string): string {
  const labels: Record<string, string> = {
    OTP_REQUIRED: "OTP requis",
    OTP_FAILED: "Échec OTP",
    OTP_VALIDATED: "OTP validé",
    DECISION_APPROVED: "Décision approuvée",
    TRANSACTION_APPROVED: "Transaction approuvée",
    TRANSACTION_CANCELLED: "Transaction annulée",
    POTENTIAL_FRAUD: "Risque potentiel",
  }

  return labels[type] ?? type.replaceAll("_", " ")
}

export default function Alerts() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadAlerts = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)

    setError("")

    try {
      const response = await api.get(
        "/dashboard/transactions",
        {
          params: {
            days: 365,
            limit: 500,
            status: "ALL",
          },
        },
      )

      const rows = getRows<Transaction>(response.data)

      setTransactions(rows)


      // Récupérer les audits de toutes les transactions chargées,
      // car les résultats OTP peuvent concerner des transactions
      // qui ne sont plus considérées comme risquées.
      const auditResults = await Promise.all(
        rows.map(async (transaction) => {
          try {
            const auditResponse = await api.get(
              `/transactions/${transaction.transaction_id}/audit`,
            )

            return getRows<AuditEvent>(auditResponse.data).map((event) => ({
              ...event,
              transaction_id:
                event.transaction_id ?? transaction.transaction_id,
            }))
          } catch {
            // Certaines transactions n'ont aucun audit.
            return []
          }
        }),
      )

      const events = auditResults
        .flat()
        .sort((a, b) => {
          return new Date(b.timestamp ?? 0).getTime()
            - new Date(a.timestamp ?? 0).getTime()
        })

      setAuditEvents(events)
      setLastUpdated(new Date())
    } catch (err) {
      console.error("Erreur de chargement des alertes :", err)
      setError(
        "Impossible de charger les données. Vérifie que l'API et PostgreSQL fonctionnent, puis réessaie.",
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadAlerts()
  }, [loadAlerts])

  const riskyTransactions = transactions.filter((transaction) => {
    const score = getScore(transaction)

    return (
      (score !== null && score >= 0.3) ||
      transaction.last_decision === "OTP_REQUIRED"
    )
  })

  const otpRequiredCount = new Set(
    [
      ...transactions
        .filter((transaction) => transaction.last_decision === "OTP_REQUIRED")
        .map((transaction) => transaction.transaction_id),
      ...auditEvents
        .filter((event) => event.event_type === "OTP_REQUIRED")
        .map((event) => event.transaction_id),
    ],
  ).size

  const otpFailedCount = new Set(
    auditEvents
      .filter((event) => event.event_type === "OTP_FAILED")
      .map((event) => event.transaction_id),
  ).size

  const otpValidatedCount = new Set(
    auditEvents
      .filter((event) => event.event_type === "OTP_VALIDATED")
      .map((event) => event.transaction_id),
  ).size

  const knownOtpOutcomes = otpFailedCount + otpValidatedCount
  const otpSuccessRate =
    knownOtpOutcomes > 0 ? otpValidatedCount / knownOtpOutcomes : null
  const otpFailureRate =
    knownOtpOutcomes > 0 ? otpFailedCount / knownOtpOutcomes : null

  const riskExposure = riskyTransactions.reduce(
    (total, transaction) => total + Number(transaction.amount || 0),
    0,
  )

  const scoredTransactions = riskyTransactions.filter(
    (transaction) => getScore(transaction) !== null,
  )

  const averageRiskScore =
    scoredTransactions.length > 0
      ? scoredTransactions.reduce(
          (total, transaction) => total + (getScore(transaction) ?? 0),
          0,
        ) / scoredTransactions.length
      : null

  // Si les audits ne contiennent pas les événements OTP,
  // on ne crée pas de chronologie fictive.
  const timeline = auditEvents.slice(0, 8)

  return (
    <AppLayout>
      <section className="px-6 pb-10 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">Risk monitoring</p>

            <h2 className="mt-1 text-3xl font-bold tracking-[-0.03em] text-[#162033]">
              Fraud Alerts
            </h2>

            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Transactions à risque et événements d'authentification
              réellement disponibles dans l'API.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => void loadAlerts(true)}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2864e8] px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
              />
              {refreshing ? "Actualisation..." : "Refresh"}
            </button>

            {lastUpdated && (
              <span className="text-[11px] text-slate-400">
                Mis à jour à {lastUpdated.toLocaleTimeString("fr-FR")}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadAlerts(true)}
              className="mt-2 font-semibold underline"
            >
              Réessayer
            </button>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AlertCard
            title="Potential fraud"
            value={loading ? "…" : String(riskyTransactions.length)}
            description="Transactions à score élevé ou OTP requis"
            icon={<ShieldAlert size={18} />}
          />

          <AlertCard
            title="OTP required"
            value={loading ? "…" : String(otpRequiredCount)}
            description="Transactions identifiées dans les données"
            icon={<Bell size={18} />}
          />

          <AlertCard
            title="OTP failed"
            value={loading ? "…" : String(otpFailedCount)}
            description="Transactions avec un événement OTP_FAILED audité"
            icon={<AlertTriangle size={18} />}
          />

          <AlertCard
            title="Risk exposure"
            value={loading ? "…" : formatAmount(riskExposure)}
            description="Montant cumulé des transactions signalées à risque"
            icon={<CircleDollarSign size={18} />}
          />
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <div>
              <h3 className="font-semibold">Risk events</h3>
              <p className="mt-1 text-xs text-slate-400">
                Transactions dont le score est au moins de 30 %, ou pour
                lesquelles une demande OTP est connue.
              </p>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-y border-slate-100 text-left text-[11px] text-slate-400">
                    <th className="px-2 py-4 font-medium">Transaction</th>
                    <th className="px-2 py-4 font-medium">Amount</th>
                    <th className="px-2 py-4 font-medium">Score</th>
                    <th className="px-2 py-4 font-medium">Pays</th>
                    <th className="px-2 py-4 font-medium">Statut</th>
                    <th className="px-2 py-4 font-medium">Date</th>
                  </tr>
                </thead>

                <tbody>
                  {!loading && riskyTransactions.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-sm text-slate-400"
                      >
                        {error
                          ? "Les données n'ont pas pu être chargées."
                          : "Aucune transaction à risque trouvée pour la période."}
                      </td>
                    </tr>
                  )}

                  {loading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-sm text-slate-400"
                      >
                        Chargement des transactions...
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    riskyTransactions.map((transaction) => (
                      <tr
                        key={transaction.transaction_id}
                        className="border-b border-slate-100 text-sm"
                      >
                        <td className="px-2 py-4 font-semibold">
                          #{transaction.transaction_id}
                        </td>

                        <td className="px-2 py-4 font-medium">
                          {formatAmount(
                            Number(transaction.amount || 0),
                            transaction.currency || "XOF",
                          )}
                        </td>

                        <td className="px-2 py-4">
                          {formatPercent(getScore(transaction))}
                        </td>

                        <td className="px-2 py-4 text-slate-500">
                          {transaction.country || "—"}
                        </td>

                        <td className="px-2 py-4 text-slate-500">
                          {transaction.last_decision ||
                            transaction.status ||
                            "Inconnu"}
                        </td>

                        <td className="px-2 py-4 text-slate-500">
                          {formatDate(transaction.timestamp)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-[11px] text-slate-400">
              La liste est limitée aux 500 transactions les plus récentes
              retournées par l'API sur les 365 derniers jours.
            </p>
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <h3 className="font-semibold">Authentication activity</h3>

            <p className="mt-1 text-xs text-slate-400">
              Événements présents dans les journaux d'audit des transactions
              à risque.
            </p>

            <div className="mt-7 space-y-6">
              {!loading && timeline.length === 0 && (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                  Aucun événement d'audit disponible pour les transactions
                  à risque chargées. Cela ne signifie pas nécessairement
                  qu'aucun événement ne s'est produit.
                </div>
              )}

              {loading && (
                <p className="text-sm text-slate-400">
                  Chargement des journaux d'audit...
                </p>
              )}

              {timeline.map((event, index) => (
                <Timeline
                  key={`${event.transaction_id}-${event.audit_id ?? index}`}
                  icon={
                    event.event_type.includes("FAILED") ? (
                      <AlertTriangle size={16} />
                    ) : event.event_type.includes("OTP") ? (
                      <Bell size={16} />
                    ) : (
                      <Clock3 size={16} />
                    )
                  }
                  title={getEventLabel(event.event_type)}
                  description={[
                    `Transaction #${event.transaction_id}`,
                    getAuditDetails(event),
                  ]
                    .filter(Boolean)
                    .join(" — ")}
                  time={formatTime(event.timestamp)}
                  last={index === timeline.length - 1}
                />
              ))}

              <Timeline
                icon={<Clock3 size={16} />}
                title="Surveillance"
                description="Les nouveaux événements seront visibles après actualisation."
                time="En attente"
                last
              />
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <div>
            <h3 className="font-semibold">Alert monitoring</h3>
            <p className="mt-1 text-xs text-slate-400">
              Indicateurs calculés à partir des transactions et des audits
              effectivement récupérés.
            </p>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <MonitoringCard
              title="Average fraud score"
              value={formatPercent(averageRiskScore)}
              description={`Sur ${scoredTransactions.length} transaction(s) à risque avec score connu`}
            />

            <MonitoringCard
              title="OTP success"
              value={formatPercent(otpSuccessRate)}
              description={
                knownOtpOutcomes > 0
                  ? `${otpValidatedCount} transaction(s) avec OTP_VALIDATED`
                  : "Aucun résultat OTP exploitable dans les audits récupérés"
              }
            />

            <MonitoringCard
              title="OTP failure"
              value={formatPercent(otpFailureRate)}
              description={
                knownOtpOutcomes > 0
                  ? `${otpFailedCount} transaction(s) avec OTP_FAILED`
                  : "Aucun résultat OTP exploitable dans les audits récupérés"
              }
            />
          </div>
        </div>
      </section>
    </AppLayout>
  )
}

function AlertCard({
  title,
  value,
  description,
  icon,
}: {
  title: string
  value: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-[24px] bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400">{title}</p>
          <p className="mt-2 text-[1.45rem] font-bold tracking-tight text-[#172033]">
            {value}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">{description}</p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#e9f0ff] text-[#2864e8]">
          {icon}
        </div>
      </div>
    </div>
  )
}

function Timeline({
  icon,
  title,
  description,
  time,
  last = false,
}: {
  icon: React.ReactNode
  title: string
  description: string
  time: string
  last?: boolean
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#e9f0ff] text-[#2864e8]">
          {icon}
        </div>

        {!last && <div className="mt-2 h-10 w-px bg-[#dbe5f3]" />}
      </div>

      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{title}</p>
          <span className="whitespace-nowrap text-[10px] text-slate-400">
            {time}
          </span>
        </div>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  )
}

function MonitoringCard({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-slate-100 p-5">
      <p className="text-xs font-medium text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[#172033]">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </div>
  )
}
