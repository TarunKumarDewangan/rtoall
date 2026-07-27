'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase, Complaint, fetchAllRows, fetchAllColumnValues } from '@/lib/supabase'
import { parseExcelFile } from '@/lib/excelImport'
import PinModal from '@/components/PinModal'

// Normalized header text -> field key, for matching an uploaded Excel
// file's header row regardless of spacing/casing/language (English or the
// Hindi labels used by the original report export both resolve the same).
const EXCEL_HEADER_MAP: Record<string, string> = {
  tokenno: 'token_no', token: 'token_no', 'टोकननंबर': 'token_no',
  ownername: 'owner_name', name: 'owner_name', complainantname: 'owner_name', 'नाम': 'owner_name', 'शिकायतकर्तानाम': 'owner_name',
  complaintdate: 'complaint_date', date: 'complaint_date', 'शिकायतदिनांक': 'complaint_date',
  department: 'department', 'विभाग': 'department',
  depthead: 'dept_head', departmenthead: 'dept_head', 'विभागाध्यक्ष': 'dept_head',
  category: 'category', 'शिकायतश्रेणी': 'category',
  topic: 'topic', subject: 'topic', 'विषय': 'topic',
  description: 'description', 'शिकायतविवरण': 'description',
  district: 'district', 'जिला': 'district',
  loginuserid: 'login_user_id', loginid: 'login_user_id', 'लॉगिनयूज़रआईडी': 'login_user_id',
  officername: 'officer_name', 'अधिकारीनाम': 'officer_name',
  officerdesignation: 'officer_designation', 'अधिकारीपदनाम': 'officer_designation',
  officerlevel: 'officer_level', level: 'officer_level', 'अधिकारीस्तर': 'officer_level',
  status: 'status', 'स्थिति': 'status',
  mobileno: 'mobile_no', mobile: 'mobile_no', 'नागरिकमोबाइल': 'mobile_no',
  resolveddate: 'resolved_date', transferdate: 'resolved_date', 'निराकरणदिनांक': 'resolved_date', 'मेंडदिनांक': 'resolved_date',
  remarks: 'remarks', 'टिप्पणी': 'remarks',
}
const EXCEL_REQUIRED_FIELDS = ['token_no']

type ParsedComplaintRow = {
  token_no: string
  owner_name?: string
  complaint_date: string | null
  resolved_date: string | null
  department: string
  dept_head: string
  category: string
  topic?: string
  description: string
  district: string
  login_user_id: string
  officer_name: string
  officer_designation: string
  officer_level: string
  status: string
  mobile_no: string
  remarks?: string
}

const EMPTY_FORM = {
  token_no: '',
  owner_name: '',
  complaint_date: '',
  resolved_date: '',
  department: 'परिवहन विभाग',
  dept_head: 'कार्यालय, परिवहन आयुक्त (परिवहन विभाग)',
  category: '',
  topic: '',
  description: '',
  district: 'धमतरी',
  login_user_id: '',
  officer_name: '',
  officer_designation: '',
  officer_level: '',
  status: 'Feedback Pending',
  mobile_no: '',
  remarks: '',
  file_link: '',
}
type FormType = typeof EMPTY_FORM

// Common status values across both the original export format (English) and
// the newer portal export format (Hindi), offered as suggestions only —
// status is free text since new exports can introduce new labels.
const STATUS_SUGGESTIONS = [
  'Feedback Pending', 'In Progress', 'Closed', 'Not Related',
  'प्रक्रियाधीन', 'निराकृत (फीडबैक लम्बित)', 'निराकृत (पॉजिटिव फीडबैक)',
]

// Classifies by keyword since statuses arrive in either English or Hindi
// depending on which export the data was bulk-imported from.
function statusClasses(status: string) {
  const s = status || ''
  if (/निराकृत|Closed/i.test(s)) return 'text-green-700 bg-green-100'
  if (/प्रक्रियाधीन|In Progress/i.test(s)) return 'text-blue-700 bg-blue-100'
  if (/Not Related|असंबंधित/i.test(s)) return 'text-gray-600 bg-gray-100'
  if (/Pending|लंबित|लम्बित/i.test(s)) return 'text-amber-700 bg-amber-100'
  return 'text-gray-600 bg-gray-100'
}

// Converts "DD-MM-YYYY" -> "YYYY-MM-DD"; passes through already-ISO or empty values
function toISODate(str: string): string | null {
  const s = str.trim()
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

type SortKey = keyof FormType | null

type ColumnDef = { id: string; label: string; sortKey?: keyof FormType }

// Order here drives both the table and the column-picker checklist.
const COLUMNS: ColumnDef[] = [
  { id: 'token_no', label: 'टोकन नंबर', sortKey: 'token_no' },
  { id: 'complaint_date', label: 'दिनांक', sortKey: 'complaint_date' },
  { id: 'category', label: 'श्रेणी' },
  { id: 'topic', label: 'विषय (Topic)', sortKey: 'topic' },
  { id: 'description', label: 'विवरण' },
  { id: 'district', label: 'जिला', sortKey: 'district' },
  { id: 'login_user_id', label: 'लॉगिन आईडी' },
  { id: 'officer', label: 'अधिकारी', sortKey: 'officer_name' },
  { id: 'officer_level', label: 'स्तर', sortKey: 'officer_level' },
  { id: 'status', label: 'स्थिति', sortKey: 'status' },
  { id: 'resolved_date', label: 'निराकरण दिनांक', sortKey: 'resolved_date' },
  { id: 'owner_name', label: 'नाम (Owner)', sortKey: 'owner_name' },
  { id: 'mobile_no', label: 'मोबाइल', sortKey: 'mobile_no' },
  { id: 'file_link', label: 'फ़ाइल' },
  { id: 'remarks', label: 'टिप्पणी (Remarks)' },
]
const VISIBLE_COLS_STORAGE_KEY = 'complaints_visible_columns'

const CELL_RENDERERS: Record<string, (e: Complaint) => JSX.Element> = {
  token_no: e => <td className="px-3 py-2 text-xs font-mono font-semibold text-blue-900 whitespace-nowrap">{e.token_no}</td>,
  complaint_date: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{fromISODate(e.complaint_date) || '—'}</td>,
  category: e => <td className="px-3 py-2 text-xs max-w-[220px] truncate" title={e.category}>{e.category}</td>,
  topic: e => <td className="px-3 py-2 text-xs max-w-[220px] truncate" title={e.topic}>{e.topic || '—'}</td>,
  description: e => <td className="px-3 py-2 text-xs max-w-[520px] whitespace-pre-line">{e.description}</td>,
  district: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{e.district}</td>,
  login_user_id: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{e.login_user_id || '—'}</td>,
  officer: e => (
    <td className="px-3 py-2 text-xs whitespace-nowrap">
      {e.officer_name ? <>{e.officer_name}<br /><span className="text-gray-400">{e.officer_designation}</span></> : '—'}
    </td>
  ),
  officer_level: e => <td className="px-3 py-2 text-xs text-center whitespace-nowrap">{e.officer_level}</td>,
  status: e => (
    <td className="px-3 py-2 text-xs">
      <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${statusClasses(e.status)}`}>{e.status}</span>
    </td>
  ),
  resolved_date: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{fromISODate(e.resolved_date) || '—'}</td>,
  owner_name: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{e.owner_name || '—'}</td>,
  mobile_no: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{e.mobile_no || '—'}</td>,
  file_link: e => (
    <td className="px-3 py-2 text-xs whitespace-nowrap">
      {e.file_link ? (
        <a href={e.file_link} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200 text-xs font-medium">
          📎 Open
        </a>
      ) : '—'}
    </td>
  ),
  remarks: e => <td className="px-3 py-2 text-xs max-w-[220px] whitespace-pre-line">{e.remarks || '—'}</td>,
}

export default function ComplaintsPage() {
  const [entries, setEntries] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('complaint_date')
  const [sortAsc, setSortAsc] = useState(false)

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

  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<Complaint | null>(null)
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

  const [pinAction, setPinAction] = useState<null
    | { type: 'edit'; entry: Complaint }
    | { type: 'delete'; id: number }
    | { type: 'deleteAll' }>(null)

  useEffect(() => { fetchEntries() }, [])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await fetchAllRows<Complaint>('complaints', 'complaint_date', false)
    if (error) showMsg('error', error.message)
    else setEntries(data || [])
    setLoading(false)
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  const statusList = useMemo(() => [...new Set(entries.map(e => e.status).filter(Boolean))], [entries])
  const levelList = useMemo(() => [...new Set(entries.map(e => e.officer_level).filter(Boolean))], [entries])

  const stats = useMemo(() => {
    const counts: Record<string, number> = {}
    entries.forEach(e => { counts[e.status || 'Unknown'] = (counts[e.status || 'Unknown'] || 0) + 1 })
    return counts
  }, [entries])

  const filtered = useMemo(() => {
    let rows = entries.filter(e => {
      if (statusFilter && e.status !== statusFilter) return false
      if (levelFilter && e.officer_level !== levelFilter) return false
      if (dateFrom && (!e.complaint_date || e.complaint_date < dateFrom)) return false
      if (dateTo && (!e.complaint_date || e.complaint_date > dateTo)) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = Object.values(e).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    if (sortKey) {
      rows = [...rows].sort((a: any, b: any) => {
        const va = a[sortKey] || ''
        const vb = b[sortKey] || ''
        const cmp = String(va).localeCompare(String(vb), 'hi')
        return sortAsc ? cmp : -cmp
      })
    }
    return rows
  }, [entries, search, statusFilter, levelFilter, dateFrom, dateTo, sortKey, sortAsc])

  function toggleSort(key: keyof FormType) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  function requestEdit(entry: Complaint) { setPinAction({ type: 'edit', entry }) }
  function requestDelete(id: number) { setPinAction({ type: 'delete', id }) }
  function requestDeleteAll() { setPinAction({ type: 'deleteAll' }) }
  function onPinSuccess() {
    if (!pinAction) return
    if (pinAction.type === 'edit') openEdit(pinAction.entry)
    else if (pinAction.type === 'delete') setDeleteId(pinAction.id)
    else if (pinAction.type === 'deleteAll') setShowDeleteAll(true)
    setPinAction(null)
  }

  function openAdd() {
    setEditEntry(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(entry: Complaint) {
    setEditEntry(entry)
    setForm({
      token_no: entry.token_no || '',
      owner_name: entry.owner_name || '',
      complaint_date: entry.complaint_date || '',
      resolved_date: entry.resolved_date || '',
      department: entry.department || '',
      dept_head: entry.dept_head || '',
      category: entry.category || '',
      topic: entry.topic || '',
      description: entry.description || '',
      district: entry.district || '',
      login_user_id: entry.login_user_id || '',
      officer_name: entry.officer_name || '',
      officer_designation: entry.officer_designation || '',
      officer_level: entry.officer_level || '',
      status: entry.status || 'Feedback Pending',
      mobile_no: entry.mobile_no || '',
      remarks: entry.remarks || '',
      file_link: entry.file_link || '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = { ...form, complaint_date: form.complaint_date || null, resolved_date: form.resolved_date || null }
    let error: any
    if (editEntry?.id) {
      ;({ error } = await supabase.from('complaints').update(payload).eq('id', editEntry.id))
    } else {
      ;({ error } = await supabase.from('complaints').insert(payload))
    }
    setSaving(false)
    if (error) showMsg('error', error.message)
    else {
      showMsg('success', editEntry ? 'शिकायत अपडेट हुई!' : 'शिकायत जोड़ी गई!')
      setShowForm(false)
      fetchEntries()
    }
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from('complaints').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'शिकायत हटाई गई।'); fetchEntries() }
  }

  async function handleDeleteAll() {
    setDeletingAll(true)
    const { error } = await supabase.from('complaints').delete().neq('id', 0)
    setDeletingAll(false)
    setShowDeleteAll(false)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'सभी शिकायतें हटाई गईं।'); fetchEntries() }
  }

  // Excel/portal exports often contain a literal line-break inside the
  // description cell. Pasted as tab-separated text that turns one logical
  // row into several physical lines, which breaks naive newline-splitting.
  // A genuine row start has a token number (e.g. CC260700096707) in one of
  // its first few tab-separated fields; any line without one is a
  // continuation of the previous row's multi-line cell and gets re-joined.
  const TOKEN_RE = /^[A-Za-z]{1,4}\d{6,}$/
  function mergeBulkLines(text: string): string[] {
    const rawLines = text.split(/\r?\n/).filter(l => l.trim() !== '')
    const merged: string[] = []
    for (const line of rawLines) {
      const cols = line.split('\t')
      const isNewRow = merged.length === 0 || cols.slice(0, 6).some(c => TOKEN_RE.test(c.trim()))
      if (isNewRow) merged.push(line)
      else merged[merged.length - 1] += '\n' + line
    }
    return merged
  }

  // Parses rows pasted from Excel/portal export (tab-separated). Auto-detects
  // which of two known layouts the pasted data uses (strips an optional
  // leading serial-number column from either):
  //  - Original report export (11 cols): token, date, dept, deptHead, category,
  //    desc, district, loginId, level, status, mobile
  //  - Newer portal export (13 cols): dept, deptHead, district, token, date,
  //    resolvedDate, category, desc, loginId, officerName, officerDesignation,
  //    level, status
  function parseBulkRows(text: string) {
    return mergeBulkLines(text)
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        let cols = line.split('\t')
        if (cols.length === 1) cols = line.split(',') // fallback for comma-separated paste
        if (cols.length >= 12 && /^\d+$/.test(cols[0].trim())) cols = cols.slice(1)
        cols = cols.map(c => c.trim())

        if (cols.length >= 13) {
          const [department, dept_head, district, token_no, complaint_date, resolved_date, category, description, login_user_id, officer_name, officer_designation, officer_level, status] = cols
          if (!token_no) return null
          return {
            token_no, complaint_date: toISODate(complaint_date), resolved_date: toISODate(resolved_date),
            department, dept_head, category, description, district, login_user_id,
            officer_name, officer_designation, officer_level, status: status || 'Feedback Pending', mobile_no: '',
          }
        }
        if (cols.length >= 11) {
          const [token_no, complaint_date, department, dept_head, category, description, district, login_user_id, officer_level, status, mobile_no] = cols
          if (!token_no) return null
          return {
            token_no, complaint_date: toISODate(complaint_date), resolved_date: null,
            department, dept_head, category, description, district, login_user_id,
            officer_name: '', officer_designation: '', officer_level, status: status || 'Feedback Pending', mobile_no,
          }
        }
        return null
      })
      .filter((r): r is NonNullable<typeof r> => !!r && !!r.token_no)
  }

  function excelRowToParsedRow(row: Record<string, string>): ParsedComplaintRow | null {
    const token_no = (row.token_no || '').trim()
    if (!token_no) return null
    return {
      token_no,
      owner_name: row.owner_name || '',
      complaint_date: toISODate(row.complaint_date || ''),
      resolved_date: toISODate(row.resolved_date || ''),
      department: row.department || '',
      dept_head: row.dept_head || '',
      category: row.category || '',
      topic: row.topic || '',
      description: row.description || '',
      district: row.district || '',
      login_user_id: row.login_user_id || '',
      officer_name: row.officer_name || '',
      officer_designation: row.officer_designation || '',
      officer_level: row.officer_level || '',
      status: row.status || 'Feedback Pending',
      mobile_no: row.mobile_no || '',
      remarks: row.remarks || '',
    }
  }

  // Shared by both the paste-textarea import and the Excel-file import —
  // handles duplicate skip/replace and the actual insert either way.
  async function importRows(parsed: ParsedComplaintRow[]) {
    if (parsed.length === 0) { showMsg('error', 'कोई मान्य पंक्ति नहीं मिली।'); return }

    setBulkSaving(true)
    setBulkLog(null)

    let toImport = parsed

    if (bulkMode === 'replace') {
      await supabase.from('complaints').delete().neq('id', 0)
    } else {
      const existing = await fetchAllColumnValues('complaints', 'token_no')
      const existingSet = new Set(existing.map(v => v?.toUpperCase()))
      const skipped = parsed.filter(r => existingSet.has(r.token_no.toUpperCase()))
      toImport = parsed.filter(r => !existingSet.has(r.token_no.toUpperCase()))
      if (skipped.length > 0) {
        setBulkLog(`${skipped.length} पहले से मौजूद टोकन छोड़े गए: ${skipped.slice(0, 5).map(s => s.token_no).join(', ')}${skipped.length > 5 ? '...' : ''}`)
      }
    }

    if (toImport.length === 0) {
      setBulkSaving(false)
      showMsg('error', 'सभी टोकन पहले से मौजूद हैं! कुछ भी नया इम्पोर्ट नहीं हुआ।')
      return
    }

    const { error } = await supabase.from('complaints').insert(toImport)
    setBulkSaving(false)
    if (error) showMsg('error', error.message)
    else {
      showMsg('success', `${toImport.length} शिकायतें इम्पोर्ट हुईं!`)
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
    const parsed = result.rows.map(excelRowToParsedRow).filter((r): r is ParsedComplaintRow => !!r)
    setBulkSaving(false)
    await importRows(parsed)
  }

  function openReportView() {
    const rows = filtered.map((e, i) => [
      String(i + 1), e.token_no, fromISODate(e.complaint_date), fromISODate(e.resolved_date), e.department, e.dept_head,
      e.category, e.description, e.district, e.login_user_id, e.officer_name, e.officer_designation,
      e.officer_level, e.status, e.mobile_no, e.remarks,
    ])
    const html = buildReportHTML(rows)
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">शिकायत निवारण (Complaints)</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} entries</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={requestDeleteAll} className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition">
              🗑️ Delete All
            </button>
            <button onClick={() => setShowBulk(true)} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              📥 Bulk Import
            </button>
            <button onClick={openReportView} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              🖨 Report View / Print
            </button>
            <div className="relative">
              <button onClick={() => setShowColPicker(v => !v)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition">
                ⚙ कॉलम
              </button>
              {showColPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowColPicker(false)} />
                  <div className="absolute right-0 top-full mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-2">
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
              + Add Complaint
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
            <div className="text-xl font-bold text-blue-900">{entries.length}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">कुल शिकायतें</div>
          </div>
          {statusList.map(s => (
            <div key={s} className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
              <div className="text-xl font-bold text-blue-900">{stats[s] || 0}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{s}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            placeholder="खोजें... (नाम, वाहन नंबर, टोकन, मोबाइल आदि)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px] focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
            <option value="">सभी स्थिति</option>
            {statusList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
            <option value="">सभी अधिकारी स्तर</option>
            {levelList.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <div className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-2 py-1 bg-white">
            <span className="text-xs text-gray-500 whitespace-nowrap">दिनांक से</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-sm focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-2 py-1 bg-white">
            <span className="text-xs text-gray-500 whitespace-nowrap">तक</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-sm focus:outline-none"
            />
          </div>
          {(search || statusFilter || levelFilter || dateFrom || dateTo) && (
            <button onClick={() => { setSearch(''); setStatusFilter(''); setLevelFilter(''); setDateFrom(''); setDateTo('') }} className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Reset</button>
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
                  {COLUMNS.filter(col => visibleCols[col.id] !== false).map(col => (
                    <th
                      key={col.id}
                      onClick={() => col.sortKey && toggleSort(col.sortKey)}
                      className={`px-3 py-3 text-left font-semibold whitespace-nowrap text-xs ${col.sortKey ? 'cursor-pointer select-none hover:bg-blue-800' : ''}`}
                    >
                      {col.label} {sortKey === col.sortKey && (sortAsc ? '▲' : '▼')}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={COLUMNS.filter(c => visibleCols[c.id] !== false).length + 2} className="text-center py-10 text-gray-400">कोई परिणाम नहीं मिला</td></tr>
                ) : filtered.map((entry, i) => (
                  <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-xs text-gray-500">{entries.findIndex(e => e.id === entry.id) + 1}</td>
                    {COLUMNS.filter(col => visibleCols[col.id] !== false).map(col => (
                      <Fragment key={col.id}>{CELL_RENDERERS[col.id](entry)}</Fragment>
                    ))}
                    <td className="px-3 py-2 text-xs">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-5">{editEntry ? 'शिकायत संपादित करें' : 'नई शिकायत जोड़ें'}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">टोकन नंबर</label>
                  <input type="text" value={form.token_no} onChange={e => setForm(f => ({ ...f, token_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">नाम (Owner)</label>
                  <input type="text" value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">शिकायत दिनांक</label>
                  <input type="date" value={form.complaint_date} onChange={e => setForm(f => ({ ...f, complaint_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">स्थिति</label>
                  <input list="status-suggestions" type="text" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  <datalist id="status-suggestions">
                    {STATUS_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">विभाग</label>
                  <input type="text" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">विभागाध्यक्ष</label>
                  <input type="text" value={form.dept_head} onChange={e => setForm(f => ({ ...f, dept_head: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">शिकायत श्रेणी</label>
                <input type="text" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">विषय (Topic)</label>
                <input type="text" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">शिकायत विवरण</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={5}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">जिला</label>
                  <input type="text" value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">लॉगिन यूज़र आईडी</label>
                  <input type="text" value={form.login_user_id} onChange={e => setForm(f => ({ ...f, login_user_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">अधिकारी स्तर</label>
                  <input type="text" value={form.officer_level} onChange={e => setForm(f => ({ ...f, officer_level: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">नागरिक मोबाइल</label>
                  <input type="text" value={form.mobile_no} onChange={e => setForm(f => ({ ...f, mobile_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">अधिकारी नाम</label>
                  <input type="text" value={form.officer_name} onChange={e => setForm(f => ({ ...f, officer_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">अधिकारी पदनाम</label>
                  <input type="text" value={form.officer_designation} onChange={e => setForm(f => ({ ...f, officer_designation: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">निराकरण दिनांक (मेंड दिनांक)</label>
                  <input type="date" value={form.resolved_date} onChange={e => setForm(f => ({ ...f, resolved_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">टिप्पणी (Remarks)</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">फ़ाइल लिंक (Telegram)</label>
                <input type="url" value={form.file_link} onChange={e => setForm(f => ({ ...f, file_link: e.target.value }))}
                  placeholder="https://t.me/c/..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <p className="text-xs text-gray-400 mt-1">Telegram में फ़ाइल/मैसेज पर राइट-क्लिक (या लॉन्ग-प्रेस) करें → "Copy Message Link" → यहाँ पेस्ट करें।</p>
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
            <h2 className="text-lg font-bold text-blue-900 mb-2">Bulk Import Complaints</h2>

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
                Excel से पंक्तियाँ कॉपी-पेस्ट करें (Tab-separated) — दोनों फॉर्मेट अपने आप पहचाने जाते हैं, क्रमांक कॉलम अपने आप हट जाएगा:
                <br />• पुराना फॉर्मेट: टोकन, दिनांक, विभाग, विभागाध्यक्ष, श्रेणी, विवरण, जिला, लॉगिन आईडी, स्तर, स्थिति, मोबाइल
                <br />• नया फॉर्मेट: विभाग, विभागाध्यक्ष, जिला, टोकन, दिनांक, मेंड दिनांक, श्रेणी, विवरण, लॉगिन आईडी, अधिकारी नाम, अधिकारी पदनाम, स्तर, स्थिति
              </p>
            ) : (
              <p className="text-sm text-gray-500 mb-4">
                .xlsx/.xls फ़ाइल सीधे अपलोड करें। हेडर रो में ये कॉलम नाम पहचाने जाते हैं (कोई भी क्रम में, हिंदी या अंग्रेज़ी): Token No, Complaint Date, Department, Dept Head, Category, Description, District, Login User Id, Officer Name, Officer Designation, Officer Level, Status, Mobile No, Resolved Date, Remarks। सिर्फ <strong>Token No</strong> ज़रूरी है — अगर वो कॉलम नहीं मिला तो पूरा इम्पोर्ट रुक जाएगा। बाकी अनजान कॉलम अपने आप नज़रअंदाज़ हो जाते हैं।
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
                  <p className="text-xs text-gray-500">पहले से मौजूद टोकन नंबर वाली शिकायतें छोड़ी जाएंगी।</p>
                </div>
              </div>
              <div
                onClick={() => setBulkMode('replace')}
                className={`flex items-start gap-3 p-3 cursor-pointer transition border-t ${bulkMode === 'replace' ? 'bg-red-50 border-l-4 border-red-500' : 'hover:bg-gray-50'}`}
              >
                <input type="radio" checked={bulkMode === 'replace'} onChange={() => setBulkMode('replace')} className="mt-1" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Replace All (Delete then Import) ⚠️ Destructive</p>
                  <p className="text-xs text-gray-500">पहले सभी मौजूदा शिकायतें हटाई जाएंगी, फिर नई सूची इम्पोर्ट होगी।</p>
                </div>
              </div>
            </div>

            {bulkSource === 'paste' ? (
              <>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  rows={10}
                  placeholder="CC260700096707&#9;15-07-2026&#9;परिवहन विभाग&#9;...&#9;9999999999"
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
          action={pinAction.type === 'edit' ? 'edit this complaint' : pinAction.type === 'delete' ? 'delete this complaint' : 'delete ALL complaints'}
          onSuccess={onPinSuccess}
          onCancel={() => setPinAction(null)}
        />
      )}

      {/* Delete Single Confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-red-700 mb-2">Confirm Delete</h3>
            <p className="text-sm text-gray-600 mb-5">क्या आप वाकई इस शिकायत को हटाना चाहते हैं?</p>
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
            <h3 className="text-xl font-bold text-red-700 mb-2">⚠️ Delete ALL Complaints?</h3>
            <p className="text-sm text-gray-700 mb-1">This will permanently delete <strong>all {entries.length} complaints</strong>.</p>
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
    </div>
  )
}

// Builds the standalone, printable report page (same design as the original
// cm17072026.xlsx report) populated with the currently filtered rows.
function buildReportHTML(rows: string[][]): string {
  const rowsJson = JSON.stringify(rows)
  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<title>शिकायत रिपोर्ट (Complaint Report) - धमतरी परिवहन विभाग</title>
<style>
  :root{--ink:#1b2430;--muted:#5b6673;--line:#dfe4ea;--bg:#f4f6f9;--card:#ffffff;--accent:#0b5fa5;--accent-dark:#083f6e;
    --pending:#b45309;--pending-bg:#fef3c7;--progress:#1d4ed8;--progress-bg:#dbeafe;--closed:#15803d;--closed-bg:#dcfce7;--notrelated:#6b7280;--notrelated-bg:#f3f4f6;}
  *{box-sizing:border-box;}
  body{margin:0;font-family:"Noto Sans Devanagari","Segoe UI",Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.45;}
  .toolbar{position:sticky;top:0;z-index:20;background:var(--card);border-bottom:1px solid var(--line);padding:14px 20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.04);}
  .toolbar button{padding:9px 16px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;}
  .toolbar button:hover{background:var(--accent-dark);}
  .container{max-width:100%;margin:0 auto;padding:20px 20px 60px;}
  header.title-block{text-align:center;margin-bottom:16px;}
  header.title-block h1{margin:0 0 4px;font-size:21px;color:var(--accent-dark);}
  header.title-block .sub{color:var(--muted);font-size:13px;}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:16px 0 18px;max-width:1300px;margin-left:auto;margin-right:auto;}
  .stat-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 8px;text-align:center;}
  .stat-card .n{font-size:20px;font-weight:700;color:var(--accent-dark);}
  .stat-card .l{font-size:11.5px;color:var(--muted);margin-top:2px;}
  .table-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px;}
  table{border-collapse:collapse;width:100%;min-width:1500px;font-size:12.8px;}
  thead th{position:sticky;top:0;background:var(--accent-dark);color:#fff;text-align:right;padding:10px 10px;font-weight:600;font-size:12.5px;white-space:nowrap;border-right:1px solid rgba(255,255,255,.15);}
  tbody td{padding:9px 10px;border-bottom:1px solid var(--line);border-right:1px solid var(--line);vertical-align:top;text-align:right;}
  tbody tr:nth-child(even){background:#fafbfc;}
  td.col-idx{text-align:center;font-weight:700;color:var(--accent-dark);width:44px;}
  td.col-token{font-weight:600;white-space:nowrap;}
  td.col-date{white-space:nowrap;text-align:center;}
  td.col-desc{max-width:420px;white-space:pre-line;text-align:right;line-height:1.55;}
  td.col-mobile{text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums;}
  td.col-level{text-align:center;}
  .status-badge{display:inline-block;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap;}
  .status-Feedback-Pending{color:var(--pending);background:var(--pending-bg);}
  .status-In-Progress{color:var(--progress);background:var(--progress-bg);}
  .status-Closed{color:var(--closed);background:var(--closed-bg);}
  .status-Not-Related{color:var(--notrelated);background:var(--notrelated-bg);}
  footer{text-align:center;color:var(--muted);font-size:12px;margin-top:20px;}
  @media print{
    body{background:#fff;}
    .toolbar{display:none !important;}
    .container{max-width:100%;padding:0;}
    table{min-width:100%;font-size:9.5px;}
    thead th{position:static;background:#e5e9ee !important;color:#000 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;border:1px solid #999;}
    tbody td{border:1px solid #ccc;}
    tbody tr{page-break-inside:avoid;break-inside:avoid;}
    .status-badge{-webkit-print-color-adjust:exact;print-color-adjust:exact;border:1px solid currentColor;}
    td.col-desc{max-width:220px;}
  }
  @media print{ .stats{grid-template-columns:repeat(auto-fit,minmax(100px,1fr));} }
  @page{size:A3 landscape;margin:10mm;}
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">🖨 Print / PDF</button></div>
<div class="container">
  <header class="title-block">
    <h1>शिकायत निवारण रिपोर्ट — परिवहन विभाग, धमतरी</h1>
    <div class="sub" id="genSub"></div>
  </header>
  <div class="stats" id="statsRow"></div>
  <div class="table-wrap">
    <table><thead><tr id="headRow"></tr></thead><tbody id="tbody"></tbody></table>
  </div>
  <footer>Total <span id="footTotal"></span> records</footer>
</div>
<script>
const HEADERS = ["क्रमांक","टोकन नंबर","शिकायत दिनांक","निराकरण दिनांक","विभाग","विभागाध्यक्ष","शिकायत श्रेणी","शिकायत विवरण","जिला","लॉगिन यूज़र आईडी","अधिकारी नाम","अधिकारी पदनाम","अधिकारी स्तर","स्थिति","नागरिक मोबाइल","टिप्पणी (Remarks)"];
const ROWS = ${rowsJson};
function esc(s){const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function statusClass(s){return "status-"+(s||"Unknown").replace(/\\s+/g,'-');}
document.getElementById('headRow').innerHTML = HEADERS.map(h=>'<th>'+esc(h)+'</th>').join('');
document.getElementById('tbody').innerHTML = ROWS.map(r=>
  '<tr><td class="col-idx">'+esc(r[0])+'</td><td class="col-token">'+esc(r[1])+'</td><td class="col-date">'+esc(r[2])+'</td><td class="col-date">'+esc(r[3]||'—')+'</td>'+
  '<td>'+esc(r[4])+'</td><td>'+esc(r[5])+'</td><td>'+esc(r[6])+'</td><td class="col-desc">'+esc(r[7])+'</td>'+
  '<td>'+esc(r[8])+'</td><td>'+esc(r[9]||'—')+'</td><td>'+esc(r[10]||'—')+'</td><td>'+esc(r[11]||'—')+'</td><td class="col-level">'+esc(r[12])+'</td>'+
  '<td><span class="status-badge '+statusClass(r[13])+'">'+esc(r[13]||'Unknown')+'</span></td><td class="col-mobile">'+esc(r[14]||'—')+'</td>'+
  '<td class="col-desc">'+esc(r[15]||'—')+'</td></tr>'
).join('');
const counts = {};
ROWS.forEach(r=>{const s=r[13]||'Unknown';counts[s]=(counts[s]||0)+1;});
const order=Object.keys(counts);
let sh='<div class="stat-card"><div class="n">'+ROWS.length+'</div><div class="l">कुल शिकायतें</div></div>';
order.forEach(s=>{sh+='<div class="stat-card"><div class="n">'+(counts[s]||0)+'</div><div class="l">'+s+'</div></div>';});
document.getElementById('statsRow').innerHTML = sh;
document.getElementById('footTotal').textContent = ROWS.length;
document.getElementById('genSub').textContent = 'Total records: '+ROWS.length+'  ·  Generated '+new Date().toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'});
</script>
</body>
</html>`
}
