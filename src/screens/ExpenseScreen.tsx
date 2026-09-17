import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Trash2, TrendingUp, TrendingDown, Check, Edit3 } from 'lucide-react'
import { useApp, uid } from '../store'
import type { Transaction, TransactionType } from '../types'
import { Sheet, Dialog, Snackbar, EmptyState, Numpad } from '../components/ui'
import ScreenHeader, { type HeaderNav } from '../components/ScreenHeader'
import { formatLocalDate, localToday } from '../services/validation'

const ACCOUNTS = ['Cash', 'Card', 'UPI', 'Bank', 'Online']
const CAT_ICONS = ['🍜','🚌','💊','🎮','💻','👕','🏠','📦','💵','🏦','🎓','💰','🛒','📱','✈️','🎵','🏋️','📚','☕','🎯']
const CAT_COLORS = ['#F97316','#3B82F6','#EF4444','#8B5CF6','#10B981','#EC4899','#F59E0B','#6B7280','#16A34A','#0EA5E9','#D946EF','#14B8A6']

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
function fmtCurrency(n: number) { return `₹${n.toLocaleString('en-IN')}` }
function fmtDate(d: string) {
  return new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function ExpenseScreen({ nav }: { nav: HeaderNav }) {
  const { state, dispatch } = useApp()
  const today = new Date()

  const [monthOffset, setMonthOffset] = useState(0)
  const [viewTab, setViewTab] = useState<TransactionType>('expense')
  const [balanceVisible, setBalanceVisible] = useState(true)

  const [addTxSheet, setAddTxSheet] = useState<{ type: TransactionType; categoryId: string } | null>(null)
  const [addCatSheet, setAddCatSheet] = useState<TransactionType | null>(null)
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  const [editTxSheet, setEditTxSheet] = useState<Transaction | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null)
  const [clearDialog, setClearDialog] = useState(false)
  const [snack, setSnack] = useState('')
  const [lastDeletedTx, setLastDeletedTx] = useState<Transaction | null>(null)
  const [addError, setAddError] = useState('')
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (snackTimer.current) clearTimeout(snackTimer.current) }, [])

  const show = (msg: string) => {
    setSnack(msg)
    if (snackTimer.current) clearTimeout(snackTimer.current)
    snackTimer.current = setTimeout(() => setSnack(''), 3500)
  }

  // Add transaction form
  const [formAmount, setFormAmount] = useState('')
  const [formCategoryId, setFormCategoryId] = useState('')
  const [formAccount, setFormAccount] = useState('Cash')
  const [formComment, setFormComment] = useState('')
  const [formDate, setFormDate] = useState(localToday)

  // Edit transaction form
  const [editAccount, setEditAccount] = useState('Cash')
  const [editComment, setEditComment] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')

  // Category form
  const [catName, setCatName] = useState('')
  const [catIcon, setCatIcon] = useState('📦')
  const [catColor, setCatColor] = useState('#F97316')
  const [catError, setCatError] = useState('')

  const selectedMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const mk = monthKey(selectedMonth)

  const monthTransactions = state.transactions.filter(t => t.date.startsWith(mk))
  const monthExpense = monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const monthIncome = monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)

  const endStr = formatLocalDate(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0))
  const rollingBalance = state.transactions
    .filter(t => t.date <= endStr)
    .reduce((s, t) => t.type === 'income' ? s + t.amount : s - t.amount, 0)

  const cats = state.categories.filter(c => c.type === viewTab)

  const catTotals = useMemo(() =>
    cats.map(c => ({
      cat: c,
      total: monthTransactions.filter(t => t.categoryId === c.id).reduce((s, t) => s + t.amount, 0),
    })), [cats, monthTransactions])

  const displayTx = monthTransactions
    .filter(t => t.type === viewTab)
    .sort((a, b) => b.date.localeCompare(a.date))

  const groupedTx = useMemo(() => {
    const groups: Record<string, Transaction[]> = {}
    displayTx.forEach(t => { if (!groups[t.date]) groups[t.date] = []; groups[t.date].push(t) })
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [displayTx])

  const openAddTx = (categoryId: string) => {
    setAddError('')
    setFormAmount('')
    setFormCategoryId(categoryId)
    setFormAccount('Cash')
    setFormComment('')
    setFormDate(localToday())
    setAddTxSheet({ type: viewTab, categoryId })
  }

  const confirmAddTx = () => {
    if (!formCategoryId) { setAddError('Please select a category'); return }
    const amount = parseFloat(formAmount)
    if (!formAmount || isNaN(amount) || amount <= 0) { setAddError('Enter a valid amount'); return }
    dispatch({
      type: 'ADD_TRANSACTION',
      transaction: { id: uid(), type: addTxSheet!.type, categoryId: formCategoryId, amount, account: formAccount, date: formDate, comment: formComment },
    })
    setAddTxSheet(null); setAddError('')
    show(`Transaction added`)
  }

  const openEditTx = (tx: Transaction) => {
    setEditTxSheet(tx)
    setEditAccount(tx.account)
    setEditComment(tx.comment || '')
    setEditDate(tx.date)
    setEditCategoryId(tx.categoryId)
    setDetailTx(null)
  }

  const saveEditTx = () => {
    if (!editTxSheet) return
    dispatch({
      type: 'UPDATE_TRANSACTION',
      id: editTxSheet.id,
      changes: { account: editAccount, comment: editComment, date: editDate, categoryId: editCategoryId },
    })
    setEditTxSheet(null)
    show('Transaction updated')
  }

  const addCategory = () => {
    if (!catName.trim()) { setCatError('Category name is required'); return }
    dispatch({
      type: 'ADD_CATEGORY',
      category: { id: uid(), name: catName.trim(), icon: catIcon, type: addCatSheet!, color: catColor },
    })
    setCatName(''); setCatIcon('📦'); setCatColor('#F97316'); setCatError('')
    setAddCatSheet(null)
    show('Category added')
  }

  const deleteTx = (id: string) => {
    const tx = state.transactions.find(t => t.id === id)
    if (tx) setLastDeletedTx(tx)
    dispatch({ type: 'DELETE_TRANSACTION', id })
    setDetailTx(null)
    show('Transaction deleted')
  }

  const undoDeleteTx = () => {
    if (!lastDeletedTx) return
    dispatch({ type: 'ADD_TRANSACTION', transaction: lastDeletedTx })
    setLastDeletedTx(null); setSnack('')
  }

  const monthLabel = selectedMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col pb-28 min-h-full">
      <ScreenHeader title="Expenses" {...nav} hideSearch action={state.transactions.length > 0 ? <button onClick={() => setClearDialog(true)} className="w-8 h-8 rounded-xl bg-danger/10 text-danger flex items-center justify-center" aria-label="Remove all expense data"><Trash2 size={14} /></button> : undefined} />
      <div className="px-5 pb-4">

        {/* Balance Card */}
        <div className="bg-primary rounded-2xl p-5 mb-4 shadow-lg shadow-primary/20">
          <div className="flex items-center justify-between mb-1">
            <p className="label-micro text-white/60">Balance · {monthLabel}</p>
            <button onClick={() => setBalanceVisible(v => !v)} className="text-white/70 active:opacity-60 transition-opacity">
              {balanceVisible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
          <p className="font-display font-black text-white num-tight mb-3" style={{ fontSize: '2.2rem' }}>
            {balanceVisible ? fmtCurrency(rollingBalance) : '₹ ••••'}
          </p>
          <div className="flex gap-5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                <TrendingUp size={12} className="text-white" />
              </div>
              <div>
                <p className="text-white/60 text-[10px]">Income</p>
                <p className="text-white text-sm font-semibold">{fmtCurrency(monthIncome)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                <TrendingDown size={12} className="text-white" />
              </div>
              <div>
                <p className="text-white/60 text-[10px]">Spent</p>
                <p className="text-white text-sm font-semibold">{fmtCurrency(monthExpense)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Month Selector */}
        <div className="flex items-center justify-between bg-muted rounded-xl px-2 py-1.5 mb-4">
          <button onClick={() => setMonthOffset(o => o - 1)} className="p-2 rounded-lg text-muted-fg active:bg-card transition-colors">
            <ChevronLeft size={18} />
          </button>
          <p className="font-display font-semibold text-sm text-fg">{monthLabel}</p>
          <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))} disabled={monthOffset >= 0}
            className={`p-2 rounded-lg transition-colors ${monthOffset >= 0 ? 'opacity-30 text-muted-fg' : 'text-muted-fg active:bg-card'}`}>
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex bg-muted rounded-xl p-1 gap-1">
          {(['expense', 'income'] as TransactionType[]).map(t => (
            <button key={t} onClick={() => setViewTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${viewTab === t ? 'bg-card text-fg shadow-sm' : 'text-muted-fg'}`}>
              {t === 'expense' ? 'Expenses' : 'Incomes'}
            </button>
          ))}
        </div>
      </div>

      {/* Category Grid */}
      <div className="px-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display font-semibold text-sm text-fg">Categories</p>
          <button onClick={() => { setCatName(''); setCatIcon('📦'); setCatColor('#F97316'); setCatError(''); setAddCatSheet(viewTab) }}
            className="flex items-center gap-1 text-xs text-primary font-semibold">
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {catTotals.map(({ cat, total }) => (
            <button key={cat.id} onClick={() => openAddTx(cat.id)}
              className="bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.97] transition-transform">
              <span className="text-2xl block mb-2">{cat.icon}</span>
              <p className="font-medium text-sm text-fg">{cat.name}</p>
              <p className={`font-display font-bold text-lg mt-0.5 ${total > 0 ? 'text-fg' : 'text-muted-fg'}`}>
                {total > 0 ? fmtCurrency(total) : '—'}
              </p>
            </button>
          ))}
          <button onClick={() => { setCatName(''); setCatIcon('📦'); setCatColor('#F97316'); setCatError(''); setAddCatSheet(viewTab) }}
            className="border-2 border-dashed border-border rounded-2xl p-4 flex flex-col items-center justify-center gap-1 text-muted-fg active:bg-muted transition-colors min-h-[100px]">
            <Plus size={20} />
            <span className="text-xs font-medium">New Category</span>
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div className="px-5">
        <p className="font-display font-semibold text-sm text-fg mb-3">Transactions</p>
        {displayTx.length === 0 ? (
          <EmptyState icon={<span>📊</span>} title="No transactions this month" subtitle="Tap a category above to add one." />
        ) : (
          <div className="flex flex-col gap-1">
            {groupedTx.map(([date, txs]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide py-2">{fmtDate(date)}</p>
                <div className="flex flex-col gap-2">
                  {txs.map(tx => {
                    const cat = state.categories.find(c => c.id === tx.categoryId)
                    return (
                      <button key={tx.id} onClick={() => setDetailTx(tx)}
                        className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 text-left active:scale-[0.98] transition-transform w-full">
                        <span className="text-xl shrink-0">{cat?.icon || '📦'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-fg">{cat?.name || 'Unknown'}</p>
                          {tx.comment && <p className="text-xs text-muted-fg truncate">{tx.comment}</p>}
                          <p className="text-[10px] text-muted-fg mt-0.5">{tx.account}</p>
                        </div>
                        <span className={`font-display font-bold text-base shrink-0 ${tx.type === 'expense' ? 'text-danger' : 'text-success'}`}>
                          {tx.type === 'expense' ? '-' : '+'}{fmtCurrency(tx.amount)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Transaction Sheet */}
      {addTxSheet && (
        <Sheet open={!!addTxSheet} onClose={() => { setAddTxSheet(null); setAddError('') }}
          title={addTxSheet.type === 'expense' ? 'Add Expense' : 'Add Income'}>
          <div className="px-5 py-4 pb-8 flex flex-col gap-4">
            {addError && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-xl">{addError}</p>}

            <div className="text-center py-5 bg-muted rounded-2xl">
              <p className="text-xs text-muted-fg mb-1">Amount</p>
              <p className="font-display font-black text-fg num-tight" style={{ fontSize: '2.2rem' }}>
                {formAmount ? `₹${formAmount}` : <span className="text-muted-fg">₹0</span>}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Category</label>
              <div className="flex gap-2 flex-wrap">
                {state.categories.filter(c => c.type === addTxSheet.type).map(c => (
                  <button key={c.id} onClick={() => { setFormCategoryId(c.id); setAddError('') }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${formCategoryId === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-fg'}`}>
                    <span>{c.icon}</span><span>{c.name}</span>
                    {formCategoryId === c.id && <Check size={11} />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Account</label>
              <div className="flex gap-2 flex-wrap">
                {ACCOUNTS.map(a => (
                  <button key={a} onClick={() => setFormAccount(a)}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${formAccount === a ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-fg'}`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Date</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Comment (optional)</label>
              <input
                className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50"
                placeholder={addTxSheet.type === 'expense' ? 'e.g. Lunch with friends' : 'e.g. Monthly pocket money'}
                value={formComment} onChange={e => setFormComment(e.target.value)} />
            </div>

            <Numpad value={formAmount} onChange={v => { setFormAmount(v); setAddError('') }} onConfirm={confirmAddTx} />
          </div>
        </Sheet>
      )}

      {/* Add Category Sheet */}
      <Sheet open={!!addCatSheet} onClose={() => setAddCatSheet(null)} title={`New ${addCatSheet === 'expense' ? 'Expense' : 'Income'} Category`}>
        <div className="px-5 py-4 pb-8 flex flex-col gap-4">
          {catError && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-xl">{catError}</p>}
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Category Name *</label>
            <input className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50"
              placeholder="e.g. Groceries, Salary, Freelance..."
              value={catName} onChange={e => { setCatName(e.target.value); setCatError('') }} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-2">Icon</label>
            <div className="flex flex-wrap gap-2">
              {CAT_ICONS.map(ic => (
                <button key={ic} onClick={() => setCatIcon(ic)}
                  className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${catIcon === ic ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted active:bg-border'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-2">Colour</label>
            <div className="flex flex-wrap gap-2">
              {CAT_COLORS.map(col => (
                <button key={col} onClick={() => setCatColor(col)} style={{ backgroundColor: col }}
                  className={`w-8 h-8 rounded-full transition-transform active:scale-90 ${catColor === col ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`} />
              ))}
            </div>
          </div>
          <div className="bg-muted rounded-2xl p-4 flex items-center gap-3">
            <span className="text-2xl">{catIcon}</span>
            <div>
              <p className="font-semibold text-sm text-fg">{catName || 'Category Name'}</p>
              <p className="text-xs text-muted-fg">{addCatSheet === 'expense' ? 'Expense' : 'Income'} category</p>
            </div>
            <div className="ml-auto w-4 h-4 rounded-full" style={{ backgroundColor: catColor }} />
          </div>
          <button onClick={addCategory} className="w-full py-4 bg-primary text-white font-semibold rounded-2xl shadow-md shadow-primary/25 active:opacity-90 transition-all">
            Add Category
          </button>
        </div>
      </Sheet>

      {/* Transaction Detail Sheet */}
      {detailTx && (
        <Sheet open={!!detailTx} onClose={() => setDetailTx(null)} title="Transaction Details">
          <div className="px-5 py-4 pb-8">
            {(() => {
              const cat = state.categories.find(c => c.id === detailTx.categoryId)
              return (
                <>
                  <div className="bg-muted rounded-2xl p-5 mb-5 text-center">
                    <span className="text-4xl block mb-3">{cat?.icon || '📦'}</span>
                    <p className={`font-display font-black num-tight mb-1 ${detailTx.type === 'expense' ? 'text-danger' : 'text-success'}`}
                      style={{ fontSize: '2rem' }}>
                      {detailTx.type === 'expense' ? '-' : '+'}{fmtCurrency(detailTx.amount)}
                    </p>
                    <p className="text-sm text-muted-fg">{cat?.name}</p>
                  </div>
                  <div className="flex flex-col gap-3 mb-6 bg-muted rounded-2xl px-4 py-3">
                    {([
                      ['Account', detailTx.account],
                      ['Date', fmtDate(detailTx.date)],
                      ['Type', detailTx.type === 'expense' ? 'Expense' : 'Income'],
                      ...(detailTx.comment ? [['Comment', detailTx.comment]] : []),
                    ] as [string, string][]).map(([label, val]) => (
                      <div key={label} className="flex justify-between gap-4 border-b border-border last:border-0 pb-3 last:pb-0">
                        <span className="text-sm text-muted-fg">{label}</span>
                        <span className="text-sm font-medium text-fg text-right">{val}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3">
                    <button onClick={() => openEditTx(detailTx)}
                      className="w-full py-3.5 bg-muted text-fg-soft font-semibold rounded-2xl border border-border active:opacity-80 flex items-center justify-center gap-2 transition-opacity">
                      <Edit3 size={15} /> Edit Transaction
                    </button>
                    <button onClick={() => setDeleteDialog(detailTx.id)}
                      className="w-full py-3.5 bg-danger/10 text-danger font-semibold rounded-2xl border border-danger/20 flex items-center justify-center gap-2 active:opacity-80 transition-opacity">
                      <Trash2 size={16} /> Delete Transaction
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </Sheet>
      )}

      {/* Edit Transaction Sheet */}
      {editTxSheet && (
        <Sheet open={!!editTxSheet} onClose={() => setEditTxSheet(null)} title="Edit Transaction">
          <div className="px-5 py-4 pb-8 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Category</label>
              <div className="flex gap-2 flex-wrap">
                {state.categories.filter(c => c.type === editTxSheet.type).map(c => (
                  <button key={c.id} onClick={() => setEditCategoryId(c.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${editCategoryId === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-fg'}`}>
                    <span>{c.icon}</span><span>{c.name}</span>
                    {editCategoryId === c.id && <Check size={11} />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Account</label>
              <div className="flex gap-2 flex-wrap">
                {ACCOUNTS.map(a => (
                  <button key={a} onClick={() => setEditAccount(a)}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${editAccount === a ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-fg'}`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Date</label>
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Comment</label>
              <input className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50"
                placeholder="Add a note..." value={editComment} onChange={e => setEditComment(e.target.value)} />
            </div>
            <button onClick={saveEditTx} className="w-full py-4 bg-primary text-white font-semibold rounded-2xl shadow-md shadow-primary/25 active:opacity-90 transition-all">
              Save Changes
            </button>
          </div>
        </Sheet>
      )}

      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}
        title="Delete transaction?"
        message="This transaction will be permanently removed and balances will be recalculated."
        confirmLabel="Delete" confirmVariant="danger"
        onConfirm={() => deleteDialog && deleteTx(deleteDialog)} />
      <Dialog open={clearDialog} onClose={() => setClearDialog(false)} title="Remove all expense data?" message="This permanently removes every income and expense transaction. Your categories will remain available." confirmLabel="Remove All" confirmVariant="danger" onConfirm={() => { void dispatch({ type: 'CLEAR_TRANSACTIONS' }); setClearDialog(false); setDetailTx(null); show('All expense data removed') }} />

      <Snackbar message={snack} show={!!snack} onUndo={lastDeletedTx ? undoDeleteTx : undefined} onDismiss={() => setSnack('')} />
    </div>
  )
}
