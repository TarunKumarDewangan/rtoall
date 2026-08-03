'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase, SubsidyStatus, fetchAllRows, fetchAllColumnValues } from '@/lib/supabase'
import { parseExcelFile } from '@/lib/excelImport'
import PinModal from '@/components/PinModal'

// Normalized header text -> field key, used to match an uploaded Excel
// file's header row regardless of spacing/casing ("VEHICLE NO", "Vehicle
// No", "vehicleno" all resolve to vehicle_no).
const EXCEL_HEADER_MAP: Record<string, string> = {
  vehicleno: 'vehicle_no', vehicle: 'vehicle_no', vehiclenumber: 'vehicle_no',
  ownername: 'owner_name', name: 'owner_name', applicantname: 'owner_name',
  mobileno: 'mobile_no', mobile: 'mobile_no', mobilenumber: 'mobile_no',
  category: 'category', vehiclecategory: 'category', vehicledesc: 'category',
  ifsc: 'ifsc',
  accountno: 'account_no', account: 'account_no', accountnumber: 'account_no',
  amount: 'amount', subsidyamt: 'amount', subsidyamount: 'amount',
  letterno: 'letter_no', letter: 'letter_no',
  date: 'application_date', applicationdate: 'application_date', dateofdistribution: 'application_date',
  transferdate: 'transfer_date', dateofsending: 'transfer_date',
  status: 'status',
  registrationyear: 'registration_year', regyear: 'registration_year', year: 'registration_year',
  remarks: 'remarks', remark: 'remarks',
}
const EXCEL_REQUIRED_FIELDS = ['vehicle_no']

type ParsedRow = {
  vehicle_no: string
  owner_name: string
  mobile_no: string
  category: string
  ifsc: string
  account_no: string
  amount: number | null
  letter_no: string
  application_date: string | null
  transfer_date: string | null
  status: string
  registration_year: string
  remarks: string
}

const EMPTY_FORM = {
  vehicle_no: '',
  owner_name: '',
  mobile_no: '',
  category: '',
  ifsc: '',
  account_no: '',
  amount: '',
  letter_no: '',
  application_date: '',
  transfer_date: '',
  status: 'NotSubmited',
  registration_year: '',
  remarks: '',
}
type FormType = typeof EMPTY_FORM

const STATUS_OPTIONS = ['Success', 'Failed', 'Sent to Bank', 'ApplicationSubmitedRTO', 'NotSubmited']

const COLUMNS = [
  { id: 'vehicle_no', label: 'Vehicle No' },
  { id: 'owner_name', label: 'Owner Name' },
  { id: 'mobile_no', label: 'Mobile No' },
  { id: 'category', label: 'Category' },
  { id: 'ifsc', label: 'IFSC' },
  { id: 'account_no', label: 'Account No' },
  { id: 'amount', label: 'Amount' },
  { id: 'letter_no', label: 'Letter No' },
  { id: 'application_date', label: 'Date' },
  { id: 'transfer_date', label: 'Transfer Date' },
  { id: 'status', label: 'Status' },
  { id: 'registration_year', label: 'Reg. Year' },
  { id: 'remarks', label: 'Remarks' },
]
const VISIBLE_COLS_STORAGE_KEY = 'subsidy_status_visible_columns'

function statusClasses(status: string) {
  const s = status || ''
  if (/success/i.test(s)) return 'text-green-700 bg-green-100'
  if (/failed/i.test(s)) return 'text-red-700 bg-red-100'
  if (/sent to bank/i.test(s)) return 'text-blue-700 bg-blue-100'
  if (/applicationsubmitedrto|submitted.*rto/i.test(s)) return 'text-amber-700 bg-amber-100'
  if (/notsubmited|not submitted/i.test(s)) return 'text-gray-600 bg-gray-100'
  return 'text-gray-600 bg-gray-100'
}

// Converts "DD-MM-YYYY" -> "YYYY-MM-DD"; passes through already-ISO or empty values
function toISODate(str: string): string | null {
  const s = (str || '').trim()
  if (!s) return null
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function fromISODate(iso: string | null): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}

export default function SubsidyStatusPage() {
  const [entries, setEntries] = useState<SubsidyStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<SubsidyStatus | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const [showBulk, setShowBulk] = useState(false)
  const [bulkSource, setBulkSource] = useState<'paste' | 'excel'>('paste')
  const [bulkText, setBulkText] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMode, setBulkMode] = useState<'skip' | 'replace'>('skip')
  const [bulkLog, setBulkLog] = useState<string | null>(null)
  const [excelFileName, setExcelFileName] = useState<string | null>(null)

  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [showRemoveDuplicatesConfirm, setShowRemoveDuplicatesConfirm] = useState(false)
  const [removingDuplicates, setRemovingDuplicates] = useState(false)

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(COLUMNS.map(c => [c.id, true]))
  )
  const [showColPicker, setShowColPicker] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(VISIBLE_COLS_STORAGE_KEY)
    if (saved) {
      try { setVisibleCols(prev => ({ ...prev, ...JSON.parse(saved) })) } catch {}
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(VISIBLE_COLS_STORAGE_KEY, JSON.stringify(visibleCols))
  }, [visibleCols])

  const [pinAction, setPinAction] = useState<null
    | { type: 'edit'; entry: SubsidyStatus }
    | { type: 'delete'; id: number }
    | { type: 'deleteAll' }
    | { type: 'removeDuplicates' }>(null)

  useEffect(() => { fetchEntries() }, [])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await fetchAllRows<SubsidyStatus>('subsidy_status', 'created_at', false)
    if (error) showMsg('error', error.message)
    else setEntries(data || [])
    setLoading(false)
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  const statusList = useMemo(() => [...new Set(entries.map(e => e.status).filter(Boolean))], [entries])

  const stats = useMemo(() => {
    const counts: Record<string, number> = {}
    entries.forEach(e => { counts[e.status || 'Unknown'] = (counts[e.status || 'Unknown'] || 0) + 1 })
    return counts
  }, [entries])

  const totalAmount = useMemo(() => entries.reduce((sum, e) => sum + (e.amount || 0), 0), [entries])

  // Counts how many times each vehicle number appears (entries can be
  // re-imported/re-added over time and end up duplicated).
  const duplicateCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    entries.forEach(e => { counts[e.vehicle_no] = (counts[e.vehicle_no] || 0) + 1 })
    return counts
  }, [entries])

  const duplicateVehicleCount = useMemo(
    () => Object.values(duplicateCounts).filter(c => c > 1).length,
    [duplicateCounts]
  )

  // For each vehicle number that appears more than once, keeps the
  // earliest-saved row (lowest id) and marks the rest for removal.
  const duplicateIdsToRemove = useMemo(() => {
    const groups: Record<string, SubsidyStatus[]> = {}
    entries.forEach(e => { (groups[e.vehicle_no] ||= []).push(e) })
    const ids: number[] = []
    Object.values(groups).forEach(group => {
      if (group.length < 2) return
      const sorted = [...group].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      sorted.slice(1).forEach(e => { if (e.id != null) ids.push(e.id) })
    })
    return ids
  }, [entries])

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (statusFilter && e.status !== statusFilter) return false
      if (showDuplicatesOnly && duplicateCounts[e.vehicle_no] <= 1) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = Object.values(e).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [entries, search, statusFilter, showDuplicatesOnly, duplicateCounts])

  function requestEdit(entry: SubsidyStatus) { setPinAction({ type: 'edit', entry }) }
  function requestDelete(id: number) { setPinAction({ type: 'delete', id }) }
  function requestDeleteAll() { setPinAction({ type: 'deleteAll' }) }
  function requestRemoveDuplicates() { setPinAction({ type: 'removeDuplicates' }) }
  function onPinSuccess() {
    if (!pinAction) return
    if (pinAction.type === 'edit') openEdit(pinAction.entry)
    else if (pinAction.type === 'delete') setDeleteId(pinAction.id)
    else if (pinAction.type === 'deleteAll') setShowDeleteAll(true)
    else if (pinAction.type === 'removeDuplicates') setShowRemoveDuplicatesConfirm(true)
    setPinAction(null)
  }

  // Keeps the earliest-saved copy of each vehicle number and deletes the
  // rest, then re-fetches and verifies every distinct vehicle number from
  // before is still present — only the extra copies vanish.
  async function handleRemoveDuplicates() {
    if (duplicateIdsToRemove.length === 0) { setShowRemoveDuplicatesConfirm(false); return }
    setRemovingDuplicates(true)

    const distinctBefore = new Set(entries.map(e => e.vehicle_no))
    const idsToRemove = new Set(duplicateIdsToRemove)

    const CHUNK = 500
    for (let i = 0; i < duplicateIdsToRemove.length; i += CHUNK) {
      const chunk = duplicateIdsToRemove.slice(i, i + CHUNK)
      const { error } = await supabase.from('subsidy_status').delete().in('id', chunk)
      if (error) {
        setRemovingDuplicates(false)
        setShowRemoveDuplicatesConfirm(false)
        showMsg('error', error.message)
        fetchEntries()
        return
      }
    }

    const { data: freshData, error: refetchError } = await fetchAllRows<SubsidyStatus>('subsidy_status', 'created_at', false)
    setRemovingDuplicates(false)
    setShowRemoveDuplicatesConfirm(false)

    if (refetchError) {
      showMsg('error', `Deleted but could not verify: ${refetchError.message}`)
      fetchEntries()
      return
    }

    const after = freshData || []
    const distinctAfter = new Set(after.map(e => e.vehicle_no))
    const lostVehicles = [...distinctBefore].filter(v => !distinctAfter.has(v))
    const stillHasRemovedId = after.some(e => e.id != null && idsToRemove.has(e.id))

    setEntries(after)

    if (lostVehicles.length > 0 || stillHasRemovedId) {
      showMsg('error',
        stillHasRemovedId
          ? 'चेतावनी: कुछ duplicate रिकॉर्ड हटाए नहीं जा सके — दोबारा कोशिश करें।'
          : `चेतावनी: ${lostVehicles.length} वाहन नंबर पूरी तरह गायब हो गए (यह नहीं होना चाहिए था): ${lostVehicles.slice(0, 5).join(', ')}। कृपया तुरंत जाँच करें।`
      )
    } else {
      showMsg('success', `${duplicateIdsToRemove.length} duplicate रिकॉर्ड हटाए गए — सभी ${distinctBefore.size} मूल वाहन नंबर सुरक्षित हैं (सत्यापित)।`)
    }
  }

  function copyAll() {
    const text = filtered.map(e => [e.vehicle_no, e.owner_name, e.mobile_no, e.status].filter(Boolean).join('\t')).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function openAdd() {
    setEditEntry(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(entry: SubsidyStatus) {
    setEditEntry(entry)
    setForm({
      vehicle_no: entry.vehicle_no || '',
      owner_name: entry.owner_name || '',
      mobile_no: entry.mobile_no || '',
      category: entry.category || '',
      ifsc: entry.ifsc || '',
      account_no: entry.account_no || '',
      amount: entry.amount != null ? String(entry.amount) : '',
      letter_no: entry.letter_no || '',
      application_date: entry.application_date || '',
      transfer_date: entry.transfer_date || '',
      status: entry.status || 'NotSubmited',
      registration_year: entry.registration_year || '',
      remarks: entry.remarks || '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      amount: form.amount ? parseFloat(form.amount) : null,
      application_date: form.application_date || null,
      transfer_date: form.transfer_date || null,
    }
    let error: any
    if (editEntry?.id) {
      ;({ error } = await supabase.from('subsidy_status').update(payload).eq('id', editEntry.id))
    } else {
      ;({ error } = await supabase.from('subsidy_status').insert(payload))
    }
    setSaving(false)
    if (error) showMsg('error', error.message)
    else {
      showMsg('success', editEntry ? 'Entry updated!' : 'Entry added!')
      setShowForm(false)
      fetchEntries()
    }
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from('subsidy_status').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Entry deleted.'); fetchEntries() }
  }

  async function handleDeleteAll() {
    setDeletingAll(true)
    const { error } = await supabase.from('subsidy_status').delete().neq('id', 0)
    setDeletingAll(false)
    setShowDeleteAll(false)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'All records deleted.'); fetchEntries() }
  }

  // Parses rows pasted from Excel (tab-separated), optional leading Sno column:
  // VehicleNo, OwnerName, MobileNO, Category, IFSC, AccountNO, Amount,
  // LetterNo, Date, TransferDate, Status, RegistrationYear, Remarks
  function parseBulkRows(text: string): ParsedRow[] {
    return text
      .split(/\r?\n/)
      // don't trim the whole line first — trailing tab-separated empty
      // columns (dates/remarks are often blank) would get stripped before
      // we can count columns correctly
      .filter(l => l.replace(/\t/g, '').trim() !== '')
      .filter(l => !/vehicle\s*no/i.test(l)) // skip header row
      .map(line => {
        let cols = line.split('\t')
        if (cols.length === 1) cols = line.split(',')
        if (cols.length >= 8 && /^\d+$/.test(cols[0].trim())) cols = cols.slice(1)
        cols = cols.map(c => c.trim())
        if (cols.length < 4) return null
        const [vehicle_no, owner_name, mobile_no, category, ifsc, account_no, amountStr, letter_no, applicationDate, transferDate, status, registration_year, remarks] = cols
        if (!vehicle_no) return null
        const amountNum = amountStr ? parseFloat(amountStr.replace(/,/g, '')) : NaN
        return {
          vehicle_no, owner_name: owner_name || '', mobile_no: mobile_no || '', category: category || '',
          ifsc: ifsc || '', account_no: account_no || '',
          amount: isNaN(amountNum) ? null : amountNum,
          letter_no: letter_no || '',
          application_date: toISODate(applicationDate || ''),
          transfer_date: toISODate(transferDate || ''),
          status: status || 'NotSubmited',
          registration_year: registration_year || '',
          remarks: remarks || '',
        }
      })
      .filter((r): r is NonNullable<typeof r> => !!r && !!r.vehicle_no)
  }

  function excelRowToParsedRow(row: Record<string, string>): ParsedRow | null {
    const vehicle_no = (row.vehicle_no || '').trim()
    if (!vehicle_no) return null
    const amountNum = row.amount ? parseFloat(row.amount.replace(/,/g, '')) : NaN
    return {
      vehicle_no,
      owner_name: row.owner_name || '',
      mobile_no: row.mobile_no || '',
      category: row.category || '',
      ifsc: row.ifsc || '',
      account_no: row.account_no || '',
      amount: isNaN(amountNum) ? null : amountNum,
      letter_no: row.letter_no || '',
      application_date: toISODate(row.application_date || ''),
      transfer_date: toISODate(row.transfer_date || ''),
      status: row.status || 'NotSubmited',
      registration_year: row.registration_year || '',
      remarks: row.remarks || '',
    }
  }

  // Shared by both the paste-textarea import and the Excel-file import —
  // handles duplicate skip/replace and the actual insert either way.
  async function importRows(parsed: ParsedRow[]) {
    if (parsed.length === 0) { showMsg('error', 'No valid rows found.'); return }

    setBulkSaving(true)
    setBulkLog(null)

    let toImport = parsed

    if (bulkMode === 'replace') {
      await supabase.from('subsidy_status').delete().neq('id', 0)
    } else {
      const existing = await fetchAllColumnValues('subsidy_status', 'vehicle_no')
      const existingSet = new Set(existing.map(v => v?.toUpperCase()))
      const skipped = parsed.filter(r => existingSet.has(r.vehicle_no.toUpperCase()))
      toImport = parsed.filter(r => !existingSet.has(r.vehicle_no.toUpperCase()))
      if (skipped.length > 0) {
        setBulkLog(`Skipped ${skipped.length} already existing: ${skipped.slice(0, 5).map(s => s.vehicle_no).join(', ')}${skipped.length > 5 ? '...' : ''}`)
      }
    }

    if (toImport.length === 0) {
      setBulkSaving(false)
      showMsg('error', 'All vehicle numbers already exist! Nothing new imported.')
      return
    }

    const { error } = await supabase.from('subsidy_status').insert(toImport)
    setBulkSaving(false)
    if (error) showMsg('error', error.message)
    else {
      showMsg('success', `${toImport.length} entries imported successfully!`)
      setShowBulk(false)
      setBulkText('')
      setBulkLog(null)
      setExcelFileName(null)
      fetchEntries()
    }
  }

  async function handleBulkImport() {
    await importRows(parseBulkRows(bulkText))
  }

  async function handleExcelFile(file: File) {
    setExcelFileName(file.name)
    setBulkSaving(true)
    setBulkLog(null)
    const result = await parseExcelFile(file, EXCEL_HEADER_MAP, EXCEL_REQUIRED_FIELDS)
    if ('error' in result) {
      setBulkSaving(false)
      showMsg('error', result.error)
      return
    }
    const parsed = result.rows.map(excelRowToParsedRow).filter((r): r is ParsedRow => !!r)
    setBulkSaving(false)
    await importRows(parsed)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 no-print">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">EV Subsidy Status</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} entries</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={requestDeleteAll} className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition">
              🗑️ Delete All
            </button>
            <button onClick={() => setShowBulk(true)} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              📥 Bulk Import
            </button>
            <button onClick={() => window.print()} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              🖨 Print
            </button>
            <button onClick={copyAll} disabled={filtered.length === 0} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition disabled:opacity-40">
              {copied ? '✅ Copied!' : '📋 Copy All'}
            </button>
            <button
              onClick={() => setShowDuplicatesOnly(v => !v)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${showDuplicatesOnly ? 'bg-amber-600 border-amber-600 text-white hover:bg-amber-700' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}`}
            >
              🔁 Check Duplicate Values {duplicateVehicleCount > 0 && `(${duplicateVehicleCount})`}
            </button>
            <button
              onClick={requestRemoveDuplicates}
              disabled={duplicateIdsToRemove.length === 0}
              className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition disabled:opacity-40"
            >
              🧹 Remove Duplicate Values {duplicateIdsToRemove.length > 0 && `(${duplicateIdsToRemove.length})`}
            </button>
            <div className="relative">
              <button onClick={() => setShowColPicker(v => !v)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition">
                ⚙ कॉलम
              </button>
              {showColPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowColPicker(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-2">
                    <div className="flex justify-between items-center px-2 py-1 mb-1 border-b border-gray-100">
                      <span className="text-xs font-semibold text-gray-500">दिखाएँ / छिपाएँ</span>
                      <div className="flex gap-2">
                        <button onClick={() => setVisibleCols(Object.fromEntries(COLUMNS.map(c => [c.id, true])))} className="text-xs text-blue-700 hover:underline">All</button>
                        <button onClick={() => setVisibleCols(Object.fromEntries(COLUMNS.map(c => [c.id, false])))} className="text-xs text-blue-700 hover:underline">None</button>
                      </div>
                    </div>
                    {COLUMNS.map(col => (
                      <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={visibleCols[col.id] !== false}
                          onChange={e => setVisibleCols(prev => ({ ...prev, [col.id]: e.target.checked }))}
                          className="w-4 h-4 accent-blue-700"
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button onClick={openAdd} className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition">
              + Add Entry
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium no-print ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4 no-print">
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
            <div className="text-xl font-bold text-blue-900">{entries.length}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">कुल एंट्री</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
            <div className="text-xl font-bold text-blue-900">₹{totalAmount.toLocaleString('en-IN')}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">कुल राशि</div>
          </div>
          {statusList.map(s => (
            <div key={s} className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
              <div className="text-xl font-bold text-blue-900">{stats[s] || 0}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{s}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-4 no-print">
          <input
            type="text"
            placeholder="Search by vehicle no, owner, mobile, letter no..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px] focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
            <option value="">All Status</option>
            {statusList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {(search || statusFilter) && (
            <button onClick={() => { setSearch(''); setStatusFilter('') }} className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Reset</button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">#</th>
                  {COLUMNS.filter(c => visibleCols[c.id] !== false).map(col => (
                    <th key={col.id} className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">{col.label}</th>
                  ))}
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs no-print">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={COLUMNS.filter(c => visibleCols[c.id] !== false).length + 2} className="text-center py-10 text-gray-400">No entries found</td></tr>
                ) : filtered.map((entry, i) => (
                  <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-xs text-gray-500">{entries.findIndex(e => e.id === entry.id) + 1}</td>
                    {visibleCols.vehicle_no !== false && (
                      <td className="px-3 py-2 text-xs font-mono font-semibold text-blue-900 whitespace-nowrap">
                        {entry.vehicle_no}
                        {duplicateCounts[entry.vehicle_no] > 1 && (
                          <span className="ml-2 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 align-middle">
                            ×{duplicateCounts[entry.vehicle_no]}
                          </span>
                        )}
                      </td>
                    )}
                    {visibleCols.owner_name !== false && <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.owner_name || '—'}</td>}
                    {visibleCols.mobile_no !== false && <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.mobile_no || '—'}</td>}
                    {visibleCols.category !== false && <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.category || '—'}</td>}
                    {visibleCols.ifsc !== false && <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">{entry.ifsc || '—'}</td>}
                    {visibleCols.account_no !== false && <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">{entry.account_no || '—'}</td>}
                    {visibleCols.amount !== false && <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.amount != null ? `₹${entry.amount.toLocaleString('en-IN')}` : '—'}</td>}
                    {visibleCols.letter_no !== false && <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.letter_no || '—'}</td>}
                    {visibleCols.application_date !== false && <td className="px-3 py-2 text-xs whitespace-nowrap">{fromISODate(entry.application_date) || '—'}</td>}
                    {visibleCols.transfer_date !== false && <td className="px-3 py-2 text-xs whitespace-nowrap">{fromISODate(entry.transfer_date) || '—'}</td>}
                    {visibleCols.status !== false && (
                      <td className="px-3 py-2 text-xs">
                        <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${statusClasses(entry.status)}`}>{entry.status}</span>
                      </td>
                    )}
                    {visibleCols.registration_year !== false && <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.registration_year || '—'}</td>}
                    {visibleCols.remarks !== false && <td className="px-3 py-2 text-xs max-w-[200px] whitespace-pre-line">{entry.remarks || '—'}</td>}
                    <td className="px-3 py-2 text-xs no-print">
                      <div className="flex gap-1">
                        <button onClick={() => requestEdit(entry)} className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium">Edit</button>
                        <button onClick={() => requestDelete(entry.id!)} className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-5">{editEntry ? 'Edit Entry' : 'Add New Entry'}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Vehicle No</label>
                  <input type="text" value={form.vehicle_no} onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Owner Name</label>
                  <input type="text" value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Mobile No</label>
                  <input type="text" value={form.mobile_no} onChange={e => setForm(f => ({ ...f, mobile_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
                  <input type="text" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. 2WN, 3WT, Motor Car"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Registration Year</label>
                  <input type="text" value={form.registration_year} onChange={e => setForm(f => ({ ...f, registration_year: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₹)</label>
                  <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">IFSC</label>
                  <input type="text" value={form.ifsc} onChange={e => setForm(f => ({ ...f, ifsc: e.target.value.toUpperCase() }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Account No</label>
                  <input type="text" value={form.account_no} onChange={e => setForm(f => ({ ...f, account_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Letter No</label>
                  <input type="text" value={form.letter_no} onChange={e => setForm(f => ({ ...f, letter_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
                  <input type="date" value={form.application_date} onChange={e => setForm(f => ({ ...f, application_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Transfer Date</label>
                  <input type="date" value={form.transfer_date} onChange={e => setForm(f => ({ ...f, transfer_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-lg bg-blue-900 text-white text-sm font-semibold hover:bg-blue-800 transition disabled:opacity-60">
                {saving ? 'Saving...' : editEntry ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-2">Bulk Import Subsidy Status</h2>

            <div className="flex gap-2 mb-4 border-b border-gray-200">
              <button
                onClick={() => setBulkSource('paste')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition ${bulkSource === 'paste' ? 'border-blue-700 text-blue-800' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                📋 Paste Text
              </button>
              <button
                onClick={() => setBulkSource('excel')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition ${bulkSource === 'excel' ? 'border-blue-700 text-blue-800' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                📊 Upload Excel File
              </button>
            </div>

            {bulkSource === 'paste' ? (
              <p className="text-sm text-gray-500 mb-4">
                Excel से पंक्तियाँ कॉपी-पेस्ट करें (Tab-separated): VehicleNo, OwnerName, MobileNO, Category, IFSC, AccountNO, Amount, LetterNo, Date, TransferDate, Status, RegistrationYear, Remarks — हेडर रो और क्रमांक कॉलम अपने आप हट जाएंगे।
              </p>
            ) : (
              <p className="text-sm text-gray-500 mb-4">
                .xlsx/.xls फ़ाइल सीधे अपलोड करें। हेडर रो में ये कॉलम नाम पहचाने जाते हैं (कोई भी क्रम में): Vehicle No, Owner Name, Mobile No, Category, IFSC, Account No, Amount, Letter No, Date, Transfer Date, Status, Registration Year, Remarks। सिर्फ <strong>Vehicle No</strong> ज़रूरी है — अगर वो कॉलम नहीं मिला तो पूरा इम्पोर्ट रुक जाएगा और गलत डेटा नहीं जाएगा। बाकी अनजान कॉलम अपने आप नज़रअंदाज़ हो जाते हैं।
              </p>
            )}

            <div className="mb-4 rounded-lg border border-gray-200 overflow-hidden">
              <div
                onClick={() => setBulkMode('skip')}
                className={`flex items-start gap-3 p-3 cursor-pointer transition ${bulkMode === 'skip' ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50'}`}
              >
                <input type="radio" checked={bulkMode === 'skip'} onChange={() => setBulkMode('skip')} className="mt-1" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Smart Import (Skip Duplicates) ✅ Recommended</p>
                  <p className="text-xs text-gray-500">पहले से मौजूद वाहन नंबर वाली एंट्री छोड़ी जाएंगी।</p>
                </div>
              </div>
              <div
                onClick={() => setBulkMode('replace')}
                className={`flex items-start gap-3 p-3 cursor-pointer transition border-t ${bulkMode === 'replace' ? 'bg-red-50 border-l-4 border-red-500' : 'hover:bg-gray-50'}`}
              >
                <input type="radio" checked={bulkMode === 'replace'} onChange={() => setBulkMode('replace')} className="mt-1" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Replace All (Delete then Import) ⚠️ Destructive</p>
                  <p className="text-xs text-gray-500">पहले सभी मौजूदा एंट्री हटाई जाएंगी, फिर नई सूची इम्पोर्ट होगी।</p>
                </div>
              </div>
            </div>

            {bulkSource === 'paste' ? (
              <>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  rows={10}
                  placeholder="CG05AP2390&#9;SHEKHAR DEWANGAN&#9;9999999999&#9;Three Wheeler (Passenger)&#9;BKID0009360&#9;936018210001048&#9;19398&#9;LTR123&#9;&#9;&#9;Success"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <p className="text-xs text-gray-400 mt-1">{parseBulkRows(bulkText).length} valid row(s) detected</p>
              </>
            ) : (
              <div>
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg px-4 py-8 cursor-pointer hover:bg-gray-50 transition">
                  <span className="text-3xl">📊</span>
                  <span className="text-sm font-medium text-gray-700">{excelFileName || 'Click to choose an Excel file (.xlsx/.xls/.csv)'}</span>
                  <span className="text-xs text-gray-400">Import starts automatically once selected</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelFile(f); e.target.value = '' }}
                  />
                </label>
              </div>
            )}

            {bulkLog && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800 mt-3">
                ℹ️ {bulkLog}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowBulk(false); setBulkLog(null); setExcelFileName(null) }} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition">Cancel</button>
              {bulkSource === 'paste' && (
                <button
                  onClick={handleBulkImport}
                  disabled={bulkSaving}
                  className={`px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 ${bulkMode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-900 hover:bg-blue-800'}`}
                >
                  {bulkSaving ? 'Importing...' : bulkMode === 'replace' ? '⚠️ Delete All & Import' : '✅ Smart Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PIN Modal */}
      {pinAction && (
        <PinModal
          action={
            pinAction.type === 'edit' ? 'edit this entry'
              : pinAction.type === 'delete' ? 'delete this entry'
              : pinAction.type === 'deleteAll' ? 'delete ALL records'
              : 'remove duplicate records'
          }
          onSuccess={onPinSuccess}
          onCancel={() => setPinAction(null)}
        />
      )}

      {/* Delete Single Confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-red-700 mb-2">Confirm Delete</h3>
            <p className="text-sm text-gray-600 mb-5">Are you sure you want to delete this entry?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ALL Confirm */}
      {showDeleteAll && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border-2 border-red-500">
            <h3 className="text-xl font-bold text-red-700 mb-2">⚠️ Delete ALL Records?</h3>
            <p className="text-sm text-gray-700 mb-1">This will permanently delete <strong>all {entries.length} entries</strong>.</p>
            <p className="text-sm text-red-600 font-semibold mb-5">This action cannot be undone!</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteAll(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeleteAll} disabled={deletingAll} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-60">
                {deletingAll ? 'Deleting...' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Duplicates Confirm */}
      {showRemoveDuplicatesConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border-2 border-red-500">
            <h3 className="text-xl font-bold text-red-700 mb-2">🧹 Remove Duplicate Values?</h3>
            <p className="text-sm text-gray-700 mb-1">
              हर वाहन नंबर की सबसे पहली एंट्री रखी जाएगी, बाकी <strong>{duplicateIdsToRemove.length} duplicate रिकॉर्ड</strong> हटा दिए जाएंगे।
            </p>
            <p className="text-sm text-red-600 font-semibold mb-5">This action cannot be undone!</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRemoveDuplicatesConfirm(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleRemoveDuplicates} disabled={removingDuplicates} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-60">
                {removingDuplicates ? 'Removing...' : 'Yes, Remove Duplicates'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
