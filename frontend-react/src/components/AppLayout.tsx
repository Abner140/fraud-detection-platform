import { useEffect, useState } from "react"
import {
  Activity,
  AlertTriangle,
  Bell,
  CircleDollarSign,
  ChevronDown,
  LayoutDashboard,
  Search,
  ShieldCheck,
  X,
} from "lucide-react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import type { FormEvent, ReactNode } from "react"
import {
  useRealtimeEvents,
  type RealtimeEvent,
} from "../hooks/useRealtimeEvents"

interface AppLayoutProps {
  children: ReactNode
}

function getEventTitle(type: string) {
  const titles: Record<string, string> = {
    POTENTIAL_FRAUD: "Fraude potentielle détectée",
  }

  return titles[type] ?? "Fraude potentielle détectée"
}

function getEventDescription(event: RealtimeEvent) {
  const id = event.data?.transaction_id
  const transaction = id != null ? `Transaction #${id}` : "Transaction"

  return `${transaction} — Une activité suspecte a été détectée. Une vérification peut être nécessaire.`
}

export default function AppLayout({ children }: AppLayoutProps) {
  const realtimeEvent = useRealtimeEvents()
  const navigate = useNavigate()
  const location = useLocation()

  const [globalSearch, setGlobalSearch] = useState("")
  const [notifications, setNotifications] = useState<RealtimeEvent[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // Synchronise la recherche globale avec l'URL.
  useEffect(() => {
    if (location.pathname === "/transactions") {
      const params = new URLSearchParams(location.search)
      setGlobalSearch(params.get("search") ?? "")
    } else {
      setGlobalSearch("")
    }
  }, [location.pathname, location.search])

  // IMPORTANT : seules les fraudes potentielles génèrent une notification.
  useEffect(() => {
    if (!realtimeEvent) return

    if (realtimeEvent.event_type !== "POTENTIAL_FRAUD") {
      return
    }

    setNotifications((current) => {
      // Évite de conserver deux notifications identiques consécutives
      // pour la même transaction.
      const transactionId = realtimeEvent.data?.transaction_id

      const alreadyExists = current.some(
        (item) =>
          item.event_type === "POTENTIAL_FRAUD" &&
          item.data?.transaction_id === transactionId &&
          transactionId != null,
      )

      if (alreadyExists) {
        return current
      }

      return [realtimeEvent, ...current].slice(0, 20)
    })
  }, [realtimeEvent])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const query = globalSearch.trim()

    if (query) {
      navigate(`/transactions?search=${encodeURIComponent(query)}`)
    } else {
      navigate("/transactions")
    }

    setNotificationsOpen(false)
    setUserMenuOpen(false)
  }

  function openMonitoring() {
    navigate("/transactions")
    setNotificationsOpen(false)
    setUserMenuOpen(false)
  }

  function openTransactionFromNotification(event: RealtimeEvent) {
    const id = event.data?.transaction_id

    if (id != null) {
      navigate(`/transactions?search=${encodeURIComponent(String(id))}`)
    }

    setNotificationsOpen(false)
  }

  return (
    <div className="min-h-screen bg-[#eef3fa] text-[#182230]">
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="hidden w-[250px] flex-col border-r border-[#dce4ef] bg-[#e9eff7] px-4 py-5 md:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-[0_6px_18px_rgba(38,99,235,0.10)]">
              <ShieldCheck size={21} className="text-[#2864e8]" />
            </div>

            <div>
              <p className="text-[15px] font-semibold tracking-tight">
                Fraud Operations
              </p>
              <p className="text-[11px] text-slate-500">
                Risk intelligence
              </p>
            </div>
          </div>

          <div className="mt-10">
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Menu
            </p>

            <nav className="space-y-2">
              <SidebarLink
                to="/"
                icon={<LayoutDashboard size={17} />}
                label="Dashboard"
              />

              <SidebarLink
                to="/transactions"
                icon={<CircleDollarSign size={17} />}
                label="Transactions"
              />

              <SidebarLink
                to="/analytics"
                icon={<Activity size={17} />}
                label="Analytics"
              />

              <SidebarLink
                to="/alerts"
                icon={<AlertTriangle size={17} />}
                label="Fraud Alerts"
              />
            </nav>
          </div>

          <div className="mt-auto">
            <div className="mt-3 rounded-3xl bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold text-slate-700">
                Fraud monitoring
              </p>

              <p className="mt-1 text-[11px] leading-5 text-slate-400">
                Real-time transaction surveillance.
              </p>

              <button
                type="button"
                onClick={openMonitoring}
                className="mt-4 w-full rounded-2xl bg-[#2864e8] py-2.5 text-xs font-semibold text-white shadow-[0_7px_18px_rgba(40,100,232,0.20)] hover:bg-blue-700"
              >
                Open monitoring
              </button>
            </div>
          </div>
        </aside>

        {/* CONTENU PRINCIPAL */}
        <main className="min-w-0 flex-1">
          <header className="relative z-30 flex flex-wrap items-center justify-between gap-4 px-6 py-5 lg:px-10">
            <div>
              <p className="text-sm text-slate-400">
                Fraud Operations Center
              </p>
              <h1 className="text-xl font-bold tracking-tight text-[#172033]">
                Monitoring workspace
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* RECHERCHE GLOBALE */}
              <form
                onSubmit={handleSearch}
                className="hidden items-center gap-2 rounded-2xl bg-white px-4 py-2.5 shadow-[0_5px_18px_rgba(15,23,42,0.05)] lg:flex"
              >
                <Search size={16} className="text-slate-400" />

                <input
                  type="search"
                  value={globalSearch}
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  placeholder="Search transaction..."
                  aria-label="Rechercher une transaction"
                  className="w-48 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />

                <button
                  type="submit"
                  className="text-xs font-semibold text-[#2864e8]"
                >
                  Go
                </button>
              </form>

              {/* NOTIFICATIONS DE FRAUDE POTENTIELLE UNIQUEMENT */}
              <div className="relative">
                <button
                  type="button"
                  aria-label="Ouvrir les notifications"
                  aria-expanded={notificationsOpen}
                  onClick={() => {
                    setNotificationsOpen((open) => !open)
                    setUserMenuOpen(false)
                  }}
                  className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-[0_5px_18px_rgba(15,23,42,0.05)] hover:text-[#2864e8]"
                >
                  <Bell size={17} />

                  {notifications.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {notifications.length > 9 ? "9+" : notifications.length}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 top-12 z-50 w-[min(90vw,360px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">Alertes de fraude</p>
                        <p className="text-xs text-slate-400">
                          {notifications.length} alerte(s) récente(s)
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {notifications.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setNotifications([])}
                            className="text-xs font-medium text-[#2864e8]"
                          >
                            Tout effacer
                          </button>
                        )}

                        <button
                          type="button"
                          aria-label="Fermer les notifications"
                          onClick={() => setNotificationsOpen(false)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <Bell size={22} className="mx-auto text-slate-300" />
                          <p className="mt-2 text-sm font-medium text-slate-600">
                            Aucune alerte de fraude
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Les transactions suspectes apparaîtront ici.
                          </p>
                        </div>
                      ) : (
                        notifications.map((item, index) => (
                          <div
                            key={`${item.event_type}-${item.data?.transaction_id ?? "event"}-${index}`}
                            className="flex gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
                          >
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                              <AlertTriangle size={16} />
                            </span>

                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() =>
                                openTransactionFromNotification(item)
                              }
                            >
                              <p className="text-sm font-semibold text-slate-700">
                                {getEventTitle(item.event_type)}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {getEventDescription(item)}
                              </p>
                            </button>

                            <button
                              type="button"
                              aria-label="Supprimer cette notification"
                              onClick={() =>
                                setNotifications((current) =>
                                  current.filter((_, i) => i !== index),
                                )
                              }
                              className="h-6 rounded-md p-1 text-slate-400 hover:bg-slate-100"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* MENU UTILISATEUR */}
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={userMenuOpen}
                  onClick={() => {
                    setUserMenuOpen((open) => !open)
                    setNotificationsOpen(false)
                  }}
                  className="flex items-center gap-2 rounded-2xl bg-white px-2.5 py-2 shadow-[0_5px_18px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#2864e8] text-xs font-semibold text-white">
                    AK
                  </div>
                  <ChevronDown size={15} className="text-slate-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="border-b border-slate-100 px-3 py-2">
                      <p className="text-sm font-semibold text-slate-700">
                        Fraud Operations
                      </p>
                      <p className="text-xs text-slate-400">
                        Espace de surveillance
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        navigate("/")
                        setUserMenuOpen(false)
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Dashboard
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        navigate("/transactions")
                        setUserMenuOpen(false)
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Transactions
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        navigate("/alerts")
                        setUserMenuOpen(false)
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Fraud Alerts
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {children}
        </main>
      </div>
    </div>
  )
}

function SidebarLink({
  to,
  icon,
  label,
}: {
  to: string
  icon: ReactNode
  label: string
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
          isActive
            ? "bg-white text-[#2864e8] shadow-[0_5px_18px_rgba(15,23,42,0.05)]"
            : "text-slate-500 hover:bg-white/70"
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}