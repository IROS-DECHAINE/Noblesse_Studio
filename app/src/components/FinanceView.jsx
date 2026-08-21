import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  CircleAlert,
  FileCheck2,
  Landmark,
  ListChecks,
  LoaderCircle,
  Plus,
  RefreshCw,
  WalletCards,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { portfolioProjects } from '../data/projectRoadmaps.js'
import { studioApi } from '../lib/desktopApi.js'
import '../finance/finance.css'

const RANGE_OPTIONS = [
  { value: '3M', label: '3 mois' },
  { value: '6M', label: '6 mois' },
  { value: '12M', label: '12 mois' },
  { value: 'ALL', label: 'Tout' },
]

const EXPENSE_CATEGORIES = [
  { id: 'ai-software', label: 'IA & logiciels' },
  { id: 'subscriptions', label: 'Abonnements' },
  { id: 'assets-marketplaces', label: 'Assets & marketplaces' },
  { id: 'contractors', label: 'Prestataires' },
  { id: 'advertising', label: 'Marketing & publicité' },
  { id: 'hardware', label: 'Matériel' },
  { id: 'legal-accounting', label: 'Juridique & comptabilité' },
  { id: 'operations', label: 'Opérations' },
  { id: 'uncategorized', label: 'Autre / à classer' },
]

const categoryById = new Map(EXPENSE_CATEGORIES.map((category) => [category.id, category.label]))
const projectById = new Map(portfolioProjects.map((project) => [project.id, project.roadmapName || project.name]))

const numberFormatter = new Intl.NumberFormat('fr-FR')
const moneyFormatters = new Map()

function moneyFormatter(currency = 'EUR', minimumFractionDigits = 0) {
  const key = `${currency}:${minimumFractionDigits}`
  if (!moneyFormatters.has(key)) {
    moneyFormatters.set(key, new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits: 2,
    }))
  }
  return moneyFormatters.get(key)
}

function formatMoneyMinor(value, currency = 'EUR', { sign = false } = {}) {
  if (!Number.isFinite(value)) return '—'
  const formatted = moneyFormatter(currency, Math.abs(value) % 100 === 0 ? 0 : 2).format(Math.abs(value) / 100)
  if (!sign || value === 0) return formatted
  return `${value > 0 ? '+' : '−'}${formatted}`
}

function formatCompactMoneyMinor(value, currency = 'EUR') {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    notation: Math.abs(value) >= 100_000_00 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 100_000 ? 1 : 0,
  }).format(value / 100)
}

function formatDate(date) {
  if (!date) return '—'
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed)
}

function todayInputValue() {
  const date = new Date()
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offsetDate.toISOString().slice(0, 10)
}

function initialDraft() {
  return {
    amount: '',
    effectiveDate: todayInputValue(),
    label: '',
    projectId: '',
    categoryId: '',
    counterparty: '',
    notes: '',
  }
}

function errorMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

function projectName(projectId) {
  return projectById.get(projectId) || (projectId ? projectId : 'Studio général')
}

function categoryName(categoryId) {
  return categoryById.get(categoryId) || categoryId || 'Non classée'
}

function sourceMeta(transaction) {
  const sourceType = transaction?.source?.type
  const verification = transaction?.verification
  if (sourceType === 'BANK_IMPORT' || verification === 'BANK_RECONCILED') return { label: 'Rapproché', className: 'is-bank' }
  if (sourceType === 'PLATFORM_STATEMENT') return { label: 'Plateforme', className: 'is-platform' }
  if (sourceType === 'LEGACY_IMPORT' || verification === 'SOURCE_VERIFIED') return { label: 'Documenté', className: 'is-verified' }
  return { label: 'Déclaré', className: 'is-declared' }
}

function transactionAmount(transaction) {
  const amount = Number(transaction?.amount_minor)
  if (!Number.isFinite(amount)) return null
  return transaction.flow === 'OUTFLOW' ? -Math.abs(amount) : Math.abs(amount)
}

function chartRows(dashboard) {
  return (dashboard?.bars || []).map((bar) => ({
    ...bar,
    revenue: Number(bar.revenueMinor || 0) / 100,
    expense: Number(bar.expenseMinor || 0) / 100,
  }))
}

function ChartTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null
  const values = Object.fromEntries(payload.map((item) => [item.dataKey, item.value]))
  const transactionCount = payload[0]?.payload?.transactionCount
  return (
    <div className="finance-chart-tooltip">
      <strong>{label}</strong>
      <span><i className="is-revenue" /> Recettes <b>{moneyFormatter(currency, Number.isInteger(values.revenue || 0) ? 0 : 2).format(values.revenue || 0)}</b></span>
      <span><i className="is-expense" /> Dépenses <b>{moneyFormatter(currency, Number.isInteger(values.expense || 0) ? 0 : 2).format(values.expense || 0)}</b></span>
      {Number.isFinite(transactionCount) && <small>{numberFormatter.format(transactionCount)} mouvement{transactionCount > 1 ? 's' : ''}</small>}
    </div>
  )
}

function KpiCard({ icon: Icon, tone, label, value, detail }) {
  return (
    <article className={`finance-kpi is-${tone}`}>
      <span className="finance-kpi-icon"><Icon size={24} strokeWidth={1.8} /></span>
      <span className="finance-kpi-copy">
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{detail}</span>
      </span>
    </article>
  )
}

export default function FinanceView() {
  const formRef = useRef(null)
  const requestIdRef = useRef(0)
  const [range, setRange] = useState('12M')
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [desktopUnavailable, setDesktopUnavailable] = useState(false)
  const [draft, setDraft] = useState(initialDraft)
  const [fieldErrors, setFieldErrors] = useState({})
  const [planResult, setPlanResult] = useState(null)
  const [planning, setPlanning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [formMessage, setFormMessage] = useState(null)
  const [bankInfoOpen, setBankInfoOpen] = useState(false)

  const refreshDashboard = useCallback(async ({ quiet = false } = {}) => {
    if (typeof studioApi.financeDashboard !== 'function') {
      setDesktopUnavailable(true)
      setLoading(false)
      setRefreshing(false)
      return
    }

    const requestId = ++requestIdRef.current
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setLoadError('')

    try {
      const nextDashboard = await studioApi.financeDashboard({ range, currency: 'EUR' })
      if (requestId !== requestIdRef.current) return
      setDashboard(nextDashboard)
      setDesktopUnavailable(false)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      const unavailable = !window.noblesseDesktop
      setDesktopUnavailable(unavailable)
      setLoadError(errorMessage(error, 'Le registre financier n’a pas pu être chargé.'))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [range])

  useEffect(() => {
    refreshDashboard()
  }, [refreshDashboard])

  useEffect(() => {
    if (typeof studioApi.onFinanceChanged !== 'function') return undefined
    return studioApi.onFinanceChanged(() => refreshDashboard({ quiet: true }))
  }, [refreshDashboard])

  const totals = dashboard?.totals
  const currency = dashboard?.currency || 'EUR'
  const bars = useMemo(() => chartRows(dashboard), [dashboard])
  const hasChartActivity = bars.some((bar) => bar.transactionCount > 0 || bar.revenue > 0 || bar.expense > 0)
  const recentTransactions = dashboard?.recentTransactions || []
  const bankConnection = dashboard?.bankConnection
  const bankConnected = bankConnection?.status === 'CONNECTED'
  const hasTransactions = Boolean(totals && Number(totals.transactionCount) > 0)
  const statusCopy = desktopUnavailable
    ? 'Registre indisponible hors de l’application bureau'
    : hasTransactions
      ? `Registre local · ${numberFormatter.format(totals.transactionCount)} mouvement${totals.transactionCount > 1 ? 's' : ''} sur la période`
      : dashboard
        ? 'Registre local · aucun mouvement sur la période'
        : 'Chargement du registre local'

  const validateDraft = () => {
    const nextErrors = {}
    const amountText = draft.amount.trim()
    const amountPattern = /^(?:(?:0|[1-9]\d*)|(?:[1-9]\d{0,2}(?:[ \u00a0\u202f]\d{3})+))(?:[,.]\d{1,2})?$/
    const normalizedAmount = amountText.replace(/[ \u00a0\u202f]/g, '').replace(',', '.')
    const amount = Number(normalizedAmount)
    if (!amountPattern.test(amountText) || !Number.isFinite(amount) || amount <= 0) {
      nextErrors.amount = 'Saisis un montant positif avec deux décimales maximum.'
    }
    if (!draft.effectiveDate) nextErrors.effectiveDate = 'Choisis la date de la dépense.'
    else if (draft.effectiveDate > todayInputValue()) nextErrors.effectiveDate = 'Une dépense payée ne peut pas être datée dans le futur.'
    if (draft.label.trim().length < 2) nextErrors.label = 'Ajoute un libellé précis (2 caractères minimum).'
    if (!draft.categoryId) nextErrors.categoryId = 'Choisis une catégorie.'
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setPlanResult(null)
    setFormMessage(null)
  }

  const prepareExpense = async (event) => {
    event.preventDefault()
    if (!validateDraft()) return
    if (typeof studioApi.financePlanExpense !== 'function') {
      setFormMessage({ tone: 'error', text: 'L’ajout réel est disponible uniquement dans l’application Noblesse Studio.' })
      return
    }

    setPlanning(true)
    setFormMessage(null)
    try {
      const request = {
        amount: draft.amount.trim().replace(/\s/g, '').replace('.', ','),
        effectiveDate: draft.effectiveDate,
        label: draft.label.trim(),
        categoryId: draft.categoryId,
      }
      if (draft.projectId) request.projectId = draft.projectId
      if (draft.counterparty.trim()) request.counterparty = draft.counterparty.trim()
      if (draft.notes.trim()) request.notes = draft.notes.trim()
      const plan = await studioApi.financePlanExpense(request)
      setPlanResult(plan)
    } catch (error) {
      setFormMessage({ tone: 'error', text: errorMessage(error, 'La dépense n’a pas pu être préparée.') })
    } finally {
      setPlanning(false)
    }
  }

  const confirmExpense = async () => {
    if (!planResult || typeof studioApi.financeApplyOperation !== 'function') return
    setApplying(true)
    setFormMessage(null)
    try {
      const result = await studioApi.financeApplyOperation({
        plan: planResult.plan,
        planHash: planResult.planHash,
        idempotencyKey: planResult.idempotencyKey,
      })
      const alreadyApplied = result?.status === 'ALREADY_APPLIED'
      setDraft(initialDraft())
      setPlanResult(null)
      setFieldErrors({})
      setFormMessage({
        tone: 'success',
        text: alreadyApplied ? 'Cette dépense était déjà enregistrée : aucun doublon n’a été créé.' : 'Dépense enregistrée dans le registre.',
      })
      await refreshDashboard({ quiet: true })
    } catch (error) {
      setFormMessage({ tone: 'error', text: errorMessage(error, 'La dépense n’a pas pu être confirmée.') })
    } finally {
      setApplying(false)
    }
  }

  const scrollToExpense = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => formRef.current?.querySelector('input')?.focus(), 280)
  }

  const plannedTransaction = planResult?.plan?.transaction || planResult?.plan || {}
  const plannedAmountMinor = Number(plannedTransaction.amount_minor)

  return (
    <section className="finance-page">
      <header className="finance-header">
        <div>
          <h1>Finances</h1>
          <p>Les mouvements réels du studio, sans estimation.</p>
        </div>
        <div className="finance-header-actions">
          <button className="finance-primary-button" type="button" onClick={scrollToExpense} disabled={desktopUnavailable}>
            <Plus size={18} /> Ajouter une dépense
          </button>
          <span className={desktopUnavailable ? 'is-unavailable' : ''}><i /> {statusCopy}</span>
        </div>
      </header>

      {loadError && (
        <div className="finance-page-alert" role="alert">
          <CircleAlert size={17} />
          <span><strong>{desktopUnavailable ? 'Application bureau requise' : 'Registre temporairement indisponible'}</strong>{loadError}</span>
          {!desktopUnavailable && <button type="button" onClick={() => refreshDashboard()}><RefreshCw size={15} /> Réessayer</button>}
        </div>
      )}

      <div className={`finance-kpis ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
        <KpiCard icon={ArrowUpRight} tone="revenue" label="Recettes enregistrées" value={loading ? '—' : formatMoneyMinor(totals?.revenueMinor, currency)} detail="Total des entrées sur la période" />
        <KpiCard icon={ArrowDownRight} tone="expense" label="Dépenses enregistrées" value={loading ? '—' : formatMoneyMinor(totals?.expenseMinor, currency)} detail="Total des sorties sur la période" />
        <KpiCard icon={WalletCards} tone="balance" label="Solde du registre" value={loading ? '—' : formatMoneyMinor(totals?.lifetimeBalanceMinor, currency, { sign: true })} detail="Recettes − dépenses, toutes périodes" />
        <KpiCard icon={ListChecks} tone="movement" label="Mouvements" value={loading ? '—' : Number.isFinite(totals?.transactionCount) ? numberFormatter.format(totals.transactionCount) : '—'} detail="Total sur la période affichée" />
      </div>

      <div className="finance-main-grid">
        <div className="finance-ledger-column">
          <section className="finance-chart-panel">
            <header>
              <div>
                <h2>Recettes et dépenses enregistrées</h2>
                <span className="finance-chart-policy"><BadgeCheck size={14} /> Registre local · couverture partielle</span>
              </div>
              <div className="finance-range-control" aria-label="Période du graphique">
                {RANGE_OPTIONS.map((option) => (
                  <button
                    className={range === option.value ? 'is-active' : ''}
                    type="button"
                    aria-pressed={range === option.value}
                    key={option.value}
                    onClick={() => setRange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </header>

            <div className="finance-chart-legend" aria-hidden="true">
              <span><i className="is-revenue" /> Recettes</span>
              <span><i className="is-expense" /> Dépenses</span>
            </div>

            <div className="finance-chart" role="img" aria-label={`Graphique des recettes et dépenses enregistrées sur ${RANGE_OPTIONS.find((option) => option.value === range)?.label}`}>
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 850, height: 300 }}>
                <BarChart data={bars} margin={{ top: 12, right: 10, left: 0, bottom: 2 }} barCategoryGap="24%">
                  <CartesianGrid stroke="rgba(81,113,141,.22)" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#8997a7', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#2a3d50' }} minTickGap={12} />
                  <YAxis tickFormatter={(value) => formatCompactMoneyMinor(value * 100, currency)} tick={{ fill: '#8997a7', fontSize: 10 }} tickLine={false} axisLine={false} width={58} />
                  <Tooltip cursor={{ fill: 'rgba(40,72,101,.12)' }} content={<ChartTooltip currency={currency} />} />
                  <Bar dataKey="revenue" name="Recettes" fill="#2f73f6" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches} />
                  <Bar dataKey="expense" name="Dépenses" fill="#f1b63e" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches} />
                </BarChart>
              </ResponsiveContainer>
              {!loading && !hasChartActivity && (
                <div className="finance-chart-empty">
                  <Banknote size={24} />
                  <strong>Aucun mouvement sur cette période</strong>
                  <span>Le graphique se remplira avec les écritures réelles du registre.</span>
                </div>
              )}
              {loading && <div className="finance-chart-loading"><LoaderCircle className="finance-spin" size={22} /> Chargement du registre…</div>}
            </div>
          </section>

          <section className="finance-recent-panel">
            <header>
              <div><h2>Mouvements récents</h2><span>{recentTransactions.length ? `${recentTransactions.length} dernière${recentTransactions.length > 1 ? 's' : ''} écriture${recentTransactions.length > 1 ? 's' : ''}` : 'Registre vide sur la période'}</span></div>
              {refreshing && <span className="finance-refreshing"><LoaderCircle className="finance-spin" size={14} /> Actualisation</span>}
            </header>

            <div className="finance-table-scroll">
              <table className="finance-table">
                <thead>
                  <tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Projet</th><th>Type</th><th>Montant</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {recentTransactions.map((transaction) => {
                    const amount = transactionAmount(transaction)
                    const source = sourceMeta(transaction)
                    return (
                      <tr key={transaction.transaction_id}>
                        <td data-label="Date">{formatDate(transaction.effective_date)}</td>
                        <td data-label="Libellé"><strong>{transaction.label}</strong>{transaction.counterparty && <small>{transaction.counterparty}</small>}</td>
                        <td data-label="Catégorie">{categoryName(transaction.category_id)}</td>
                        <td data-label="Projet">{projectName(transaction.project_id)}</td>
                        <td data-label="Type"><span className="finance-type-tag">{transaction.flow === 'OUTFLOW' ? 'Dépense' : 'Recette'}</span></td>
                        <td data-label="Montant"><b className={transaction.flow === 'OUTFLOW' ? 'is-outflow' : 'is-inflow'}>{formatMoneyMinor(amount, transaction.currency || currency, { sign: true })}</b></td>
                        <td data-label="Source"><span className={`finance-source ${source.className}`}><i /> {source.label}</span></td>
                      </tr>
                    )
                  })}
                  {!loading && recentTransactions.length === 0 && (
                    <tr className="finance-empty-row"><td colSpan="7">Aucune écriture réelle à afficher pour cette période.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="finance-expense-panel" ref={formRef} aria-labelledby="finance-expense-title">
          <header>
            <div><h2 id="finance-expense-title">Ajouter une dépense</h2><p>Prépare, relis, puis confirme l’écriture.</p></div>
          </header>

          <form onSubmit={prepareExpense} noValidate>
            <label className="finance-field finance-amount-field">
              <span>Montant</span>
              <span className={`finance-input-shell ${fieldErrors.amount ? 'has-error' : ''}`}>
                <input value={draft.amount} inputMode="decimal" autoComplete="off" placeholder="0,00" aria-invalid={Boolean(fieldErrors.amount)} onChange={(event) => updateDraft('amount', event.target.value)} disabled={desktopUnavailable || Boolean(planResult)} />
                <b>EUR</b>
              </span>
              {fieldErrors.amount && <small className="finance-field-error">{fieldErrors.amount}</small>}
            </label>

            <label className="finance-field">
              <span>Date</span>
              <input type="date" value={draft.effectiveDate} max={todayInputValue()} aria-invalid={Boolean(fieldErrors.effectiveDate)} onChange={(event) => updateDraft('effectiveDate', event.target.value)} disabled={desktopUnavailable || Boolean(planResult)} />
              {fieldErrors.effectiveDate && <small className="finance-field-error">{fieldErrors.effectiveDate}</small>}
            </label>

            <label className="finance-field">
              <span>Libellé</span>
              <input value={draft.label} maxLength={120} placeholder="Ex. Abonnement GPT Pro" aria-invalid={Boolean(fieldErrors.label)} onChange={(event) => updateDraft('label', event.target.value)} disabled={desktopUnavailable || Boolean(planResult)} />
              {fieldErrors.label && <small className="finance-field-error">{fieldErrors.label}</small>}
            </label>

            <label className="finance-field">
              <span>Projet</span>
              <select value={draft.projectId} onChange={(event) => updateDraft('projectId', event.target.value)} disabled={desktopUnavailable || Boolean(planResult)}>
                <option value="">Studio général (sans projet)</option>
                {portfolioProjects.map((project) => <option value={project.id} key={project.id}>{project.roadmapName || project.name}</option>)}
              </select>
            </label>

            <label className="finance-field">
              <span>Catégorie</span>
              <select value={draft.categoryId} aria-invalid={Boolean(fieldErrors.categoryId)} onChange={(event) => updateDraft('categoryId', event.target.value)} disabled={desktopUnavailable || Boolean(planResult)}>
                <option value="">Sélectionner une catégorie</option>
                {EXPENSE_CATEGORIES.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}
              </select>
              {fieldErrors.categoryId && <small className="finance-field-error">{fieldErrors.categoryId}</small>}
            </label>

            <label className="finance-field">
              <span>Fournisseur</span>
              <input value={draft.counterparty} maxLength={120} placeholder="Nom du fournisseur" onChange={(event) => updateDraft('counterparty', event.target.value)} disabled={desktopUnavailable || Boolean(planResult)} />
            </label>

            <label className="finance-field">
              <span>Note</span>
              <textarea value={draft.notes} maxLength={1000} rows="3" placeholder="Note (optionnelle)" onChange={(event) => updateDraft('notes', event.target.value)} disabled={desktopUnavailable || Boolean(planResult)} />
              <small className="finance-character-count">{draft.notes.length}/1000</small>
            </label>

            {planResult && (
              <section className="finance-confirmation" aria-labelledby="finance-confirmation-title">
                <header><span><FileCheck2 size={17} /></span><div><strong id="finance-confirmation-title">Vérifie avant d’enregistrer</strong><small>L’écriture devient immuable après confirmation.</small></div><button type="button" aria-label="Modifier la dépense" onClick={() => setPlanResult(null)}><X size={16} /></button></header>
                <dl>
                  <div><dt>Montant</dt><dd>{Number.isFinite(plannedAmountMinor) ? formatMoneyMinor(plannedAmountMinor, plannedTransaction.currency || 'EUR') : `${draft.amount} €`}</dd></div>
                  <div><dt>Date</dt><dd>{formatDate(plannedTransaction.effective_date || draft.effectiveDate)}</dd></div>
                  <div><dt>Libellé</dt><dd>{plannedTransaction.label || draft.label}</dd></div>
                  <div><dt>Projet</dt><dd>{projectName(plannedTransaction.project_id ?? draft.projectId)}</dd></div>
                  <div><dt>Catégorie</dt><dd>{categoryName(plannedTransaction.category_id || draft.categoryId)}</dd></div>
                </dl>
                <div className="finance-confirmation-actions">
                  <button type="button" onClick={() => setPlanResult(null)} disabled={applying}>Modifier</button>
                  <button type="button" onClick={confirmExpense} disabled={applying}>{applying ? <LoaderCircle className="finance-spin" size={16} /> : <BadgeCheck size={16} />} Confirmer l’écriture</button>
                </div>
              </section>
            )}

            {formMessage && <div className={`finance-form-message is-${formMessage.tone}`} role={formMessage.tone === 'error' ? 'alert' : 'status'}>{formMessage.tone === 'success' ? <BadgeCheck size={16} /> : <CircleAlert size={16} />}<span>{formMessage.text}</span></div>}

            {!planResult && (
              <button className="finance-submit" type="submit" disabled={planning || desktopUnavailable}>
                {planning ? <LoaderCircle className="finance-spin" size={17} /> : <FileCheck2 size={17} />}
                {planning ? 'Préparation…' : 'Préparer la dépense'}
              </button>
            )}
          </form>
        </aside>
      </div>

      <section className="finance-bank-panel" aria-labelledby="finance-bank-title">
        <span className="finance-bank-icon"><Landmark size={24} /></span>
        <div>
          <header><h2 id="finance-bank-title">Banque du studio</h2><span className={bankConnected ? 'is-connected' : ''}><i /> {bankConnected ? 'Connectée en lecture seule' : 'Non connectée'}</span></header>
          <p>{bankConnected ? 'Les mouvements bancaires sont importés puis rapprochés avec le registre.' : 'Les futurs imports bancaires seront rapprochés sans remplacer les saisies manuelles.'}</p>
          {bankInfoOpen && <small role="status">{bankConnected ? `Dernière synchronisation : ${bankConnection.lastSyncAt ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(bankConnection.lastSyncAt)) : '—'}.` : 'Aucune donnée bancaire n’est demandée aujourd’hui. La connexion sera activée en lecture seule avec un fournisseur sécurisé et une validation explicite.'}</small>}
        </div>
        <button type="button" aria-expanded={bankInfoOpen} onClick={() => setBankInfoOpen((open) => !open)}>{bankInfoOpen ? 'Masquer les détails' : bankConnected ? 'Voir la connexion' : 'En savoir plus'}</button>
      </section>
    </section>
  )
}
