
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Search,
  SlidersHorizontal,
  CalendarDays,
  ChevronDown,
  ArrowUpRight,
  RefreshCw,
  Download,
  AlertCircle,
  X,
} from "lucide-react"
import AppLayout from "../components/AppLayout"
import { api } from "../lib/api"

type ApiTransaction = {
  transaction_id: number  
  amount: number
  currency?: string
  country?: string
  timestamp: string
  status: string
  fraud_probability?: number | null
  last_decision?: string | null
  model_version?: string | null
}

type Transaction = {
  id: number
  date: string
  amount: number
  currency: string
  country: string
  score: number | null
  risk: "Legitimate" | "Potential fraud" | "Unknown"
  status: string
  decision: string
  modelVersion: string
}

const PERIODS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 365 days", days: 365 },
]

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

function formatAmount(amount: number, currency: string) {
  return `${Number(amount).toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
  })} ${currency || "XOF"}`
}

function mapTransaction(item: ApiTransaction): Transaction {
  const probability =
    typeof item.fraud_probability === "number"
      ? item.fraud_probability
      : null

  return {
    id: item.transaction_id,
    date: formatDate(item.timestamp),
    amount: Number(item.amount) || 0,
    currency: item.currency || "XOF",
    country: item.country || "Unknown",
    score: probability,
    risk:
      probability === null
        ? "Unknown"
        : probability >= 0.3
          ? "Potential fraud"
          : "Legitimate",
    status: item.status || "UNKNOWN",
    decision: item.last_decision || "Not available",
    modelVersion: item.model_version || "Not available",
  }
}

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const [status, setStatus] = useState("ALL")
  const [risk, setRisk] = useState("All")
  const [country, setCountry] = useState("All")
  const [period, setPeriod] = useState("365")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "")
  }, [searchParams])

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    setError("")

    try {
      const response = await api.get("/dashboard/transactions", {
        params: {
          days: Number(period),
          limit: 500,
          status,
        },
      })

      const rows: ApiTransaction[] = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : []

      const mapped = rows.map(mapTransaction)
      setTransactions(mapped)

      setSelectedId((current) => {
        if (current !== null && mapped.some((item) => item.id === current)) {
          return current
        }

        return mapped[0]?.id ?? null
      })
    } catch (err) {
      console.error("Unable to load transactions:", err)
      setError(
        "Impossible de charger les transactions. Vérifie que FastAPI est démarré et accessible."
      )
    } finally {
      setLoading(false)
    }
  }, [period, status])

  useEffect(() => {
    void loadTransactions()
  }, [loadTransactions])

  const countries = useMemo(
    () => [...new Set(transactions.map((item) => item.country))].sort(),
    [transactions]
  )

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const query = search.trim()
      const matchesSearch =
        query === "" || String(transaction.id).includes(query)

      const matchesRisk = risk === "All" || transaction.risk === risk
      const matchesCountry = country === "All" || transaction.country === country

      return matchesSearch && matchesRisk && matchesCountry
    })
  }, [transactions, search, risk, country])

  const selected =
    filteredTransactions.find((item) => item.id === selectedId) ??
    filteredTransactions[0] ??
    null

  function updateSearch(value: string) {
    setSearch(value)

    const params = new URLSearchParams(searchParams)

    if (value.trim()) {
      params.set("search", value)
    } else {
      params.delete("search")
    }

    setSearchParams(params, { replace: true })
  }

  function exportCSV() {
    const headers = [
      "Transaction ID",
      "Date",
      "Amount",
      "Currency",
      "Country",
      "Fraud probability (%)",
      "Risk",
      "Status",
      "Last decision",
      "Model version",
    ]

    const rows = filteredTransactions.map((item) => [
      item.id,
      item.date,
      item.amount,
      item.currency,
      item.country,
      item.score === null ? "" : (item.score * 100).toFixed(4),
      item.risk,
      item.status,
      item.decision,
      item.modelVersion,
    ])

    const escapeCSV = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCSV).join(";"))
      .join("\r\n")

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = "transactions.csv"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <AppLayout>
      <section className="px-6 pb-10 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">Transaction monitoring</p>
            <h2 className="mt-1 text-3xl font-bold tracking-[-0.03em] text-[#162033]">
              Transactions
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Consulte et analyse les transactions enregistrées dans la plateforme.
            </p>
          </div>

          <button
            onClick={() => void loadTransactions()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Actualiser
          </button>
        </div>

        <div className="mt-6 rounded-[28px] bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={17} className="text-[#2864e8]" />
            <p className="text-sm font-semibold">Filtres</p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative">
              <CalendarDays size={15} className="absolute left-3 top-3 text-slate-400" />
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-[#f8fafc] pl-9 pr-9 text-xs font-medium text-slate-700 outline-none"
                aria-label="Période"
              >
                {PERIODS.map((item) => (
                  <option key={item.days} value={String(item.days)}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-slate-400" />
            </div>

            <SelectFilter
              label="Statut"
              value={status}
              options={[
                { value: "ALL", label: "Tous les statuts" },
                { value: "PENDING", label: "En attente" },
                { value: "APPROVED", label: "Approuvée" },
                { value: "CANCELLED", label: "Annulée" },
              ]}
              onChange={setStatus}
            />

            <SelectFilter
              label="Risque"
              value={risk}
              options={[
                { value: "All", label: "Tous les risques" },
                { value: "Legitimate", label: "Faible risque" },
                { value: "Potential fraud", label: "Fraude potentielle" },
                { value: "Unknown", label: "Score indisponible" },
              ]}
              onChange={setRisk}
            />

            <SelectFilter
              label="Pays"
              value={country}
              options={[
                { value: "All", label: "Tous les pays" },
                ...countries.map((item) => ({ value: item, label: item })),
              ]}
              onChange={setCountry}
            />

            <div className="flex h-11 items-center rounded-2xl border border-slate-200 bg-[#f8fafc] px-3">
              <Search size={15} className="text-slate-400" />
              <input
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder="Identifiant (ex. 17)"
                aria-label="Rechercher un identifiant"
                className="ml-2 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Effacer la recherche"
                  onClick={() => updateSearch("")}
                  className="ml-1 text-slate-400 hover:text-slate-700"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Erreur de chargement</p>
              <p className="mt-1">{error}</p>
              <button
                onClick={() => void loadTransactions()}
                className="mt-2 font-semibold underline"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-[28px] bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
            <div>
              <h3 className="font-semibold">Transactions enregistrées</h3>
              <p className="mt-1 text-xs text-slate-400">
                {filteredTransactions.length} transaction(s)
              </p>
            </div>

            <button
              onClick={exportCSV}
              disabled={filteredTransactions.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2864e8] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Download size={14} />
              Exporter CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-y border-slate-100 text-left text-[11px] text-slate-400">
                  <th className="px-6 py-4 font-medium">Transaction</th>
                  <th className="px-4 py-4 font-medium">Date</th>
                  <th className="px-4 py-4 font-medium">Montant</th>
                  <th className="px-4 py-4 font-medium">Pays</th>
                  <th className="px-4 py-4 font-medium">Score de fraude</th>
                  <th className="px-4 py-4 font-medium">Risque</th>
                  <th className="px-6 py-4 font-medium">Statut</th>
                </tr>
              </thead>

              <tbody>
                {loading && transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">
                      Chargement des transactions…
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">
                      {search
                        ? `Aucune transaction trouvée pour « ${search} ».`
                        : "Aucune transaction ne correspond aux filtres."}
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      onClick={() => setSelectedId(transaction.id)}
                      className={`cursor-pointer border-b border-slate-100 text-sm transition ${
                        selected?.id === transaction.id
                          ? "bg-[#f2f6fd]"
                          : "hover:bg-[#f8fafc]"
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#182230]">
                            #{transaction.id}
                          </span>
                          <ArrowUpRight size={13} className="text-slate-300" />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">{transaction.date}</td>
                      <td className="px-4 py-4 font-medium">
                        {formatAmount(transaction.amount, transaction.currency)}
                      </td>
                      <td className="px-4 py-4 text-slate-500">{transaction.country}</td>
                      <td className="px-4 py-4 font-medium">
                        {transaction.score === null
                          ? "Indisponible"
                          : `${(transaction.score * 100).toFixed(2)}%`}
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {transaction.risk === "Legitimate"
                          ? "Faible"
                          : transaction.risk === "Potential fraud"
                            ? "Élevé"
                            : "Inconnu"}
                      </td>
                      <td className="px-6 py-4 font-semibold">{transaction.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.4fr]">
            <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
              <p className="text-xs text-slate-400">Transaction sélectionnée</p>
              <h3 className="mt-2 text-2xl font-bold">#{selected.id}</h3>
              <p className="mt-1 text-sm text-slate-400">{selected.date}</p>

              <div className="mt-6 space-y-4">
                <DetailRow label="Montant" value={formatAmount(selected.amount, selected.currency)} />
                <DetailRow label="Pays" value={selected.country} />
                <DetailRow
                  label="Probabilité de fraude"
                  value={selected.score === null ? "Indisponible" : `${(selected.score * 100).toFixed(4)}%`}
                />
                <DetailRow label="Risque" value={selected.risk} />
                <DetailRow label="Statut" value={selected.status} />
                <DetailRow label="Dernière décision" value={selected.decision} />
                <DetailRow label="Version du modèle" value={selected.modelVersion} />
              </div>
            </div>

            <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
              <p className="text-xs text-slate-400">Informations disponibles</p>
              <h3 className="mt-2 text-lg font-semibold">État de la transaction</h3>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Ces informations proviennent de l’API de surveillance des transactions.
                La chronologie détaillée doit être chargée depuis le journal d’audit de cette transaction.
              </p>

              <div className="mt-6 space-y-4">
                <TimelineItem
                  title="Transaction enregistrée"
                  description="Informations récupérées depuis l’API."
                />
                <TimelineItem
                  title="Décision disponible"
                  description={
                    selected.decision === "Not available"
                      ? "Aucune décision détaillée n’est fournie par cet endpoint."
                      : `Dernière décision connue : ${selected.decision}.`
                  }
                />
                <TimelineItem
                  title={`Statut actuel : ${selected.status}`}
                  description="Statut communiqué par le backend."
                  last
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </AppLayout>
  )
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-[#f8fafc] px-3 pr-9 text-xs font-medium text-slate-700 outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-slate-400" />
      <p className="pointer-events-none absolute -top-2 left-3 bg-[#f8fafc] px-1 text-[9px] text-slate-400">
        {label}
      </p>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="break-all text-right text-sm font-semibold text-slate-700">
        {value}
      </span>
    </div>
  )
}

function TimelineItem({
  title,
  description,
  last = false,
}: {
  title: string
  description: string
  last?: boolean
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="mt-1 h-3 w-3 rounded-full bg-[#2864e8]" />
        {!last && <div className="mt-1 h-full w-px bg-[#dbe5f3]" />}
      </div>
      <div className="pb-5">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
      </div>
    </div>
  )
}
