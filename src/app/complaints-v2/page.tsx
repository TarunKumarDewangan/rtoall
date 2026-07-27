'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase, ComplaintV2, OfficerActivity, fetchAllRows, fetchAllColumnValues } from '@/lib/supabase'
import { parseExcelFile } from '@/lib/excelImport'
import PinModal from '@/components/PinModal'

// Normalized header text -> field key, for matching an uploaded Excel
// file's header row regardless of spacing/casing/language. Bulk import only
// covers the basic (flat) fields — officer activity history is added later
// per-record in the Edit form since it's a repeating structure.
const EXCEL_HEADER_MAP: Record<string, string> = {
  tokenno: 'token_no', token: 'token_no', 'टोकननंबर': 'token_no',
  ownername: 'owner_name', name: 'owner_name', complainantname: 'owner_name', 'नाम': 'owner_name', 'शिकायतकर्तानाम': 'owner_name', 'शिकायतकर्तांकानाम': 'owner_name',
  complaintdate: 'complaint_date', date: 'complaint_date', 'शिकायतदिनांक': 'complaint_date',
  department: 'department', 'विभाग': 'department', 'विभागकानाम': 'department',
  depthead: 'dept_head', departmenthead: 'dept_head', 'विभागाध्यक्ष': 'dept_head',
  category: 'category', 'शिकायतश्रेणी': 'category',
  topic: 'topic', subject: 'topic', 'विषय': 'topic',
  description: 'description', 'शिकायतविवरण': 'description',
  district: 'district', 'जिला': 'district',
  block: 'block', 'विकासखण्ड': 'block', 'विकासखंड': 'block',
  address: 'address', 'पता': 'address',
  loginuserid: 'login_user_id', loginid: 'login_user_id', 'लॉगिनयूज़रआईडी': 'login_user_id',
  officername: 'officer_name', 'अधिकारीनाम': 'officer_name',
  officerdesignation: 'officer_designation', 'अधिकारीपदनाम': 'officer_designation',
  officerlevel: 'officer_level', level: 'officer_level', 'अधिकारीस्तर': 'officer_level',
  status: 'status', 'स्थिति': 'status',
  mobileno: 'mobile_no', mobile: 'mobile_no', 'नागरिकमोबाइल': 'mobile_no', 'मोबाइलनम्बर': 'mobile_no',
  resolveddate: 'resolved_date', transferdate: 'resolved_date', 'निराकरणदिनांक': 'resolved_date', 'मेंडदिनांक': 'resolved_date',
  complainantdocuments: 'complainant_documents', 'शिकायतकर्ताद्वारासंलग्नदस्तावेज': 'complainant_documents',
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
  block?: string
  address?: string
  login_user_id: string
  officer_name: string
  officer_designation: string
  officer_level: string
  status: string
  mobile_no: string
  complainant_documents?: string
  remarks?: string
}

const EMPTY_ACTIVITY: OfficerActivity = {
  level: '', date: '', name: '', designation: '', mobile: '', resolution: '', status: '', documents: '',
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
  block: '',
  address: '',
  login_user_id: '',
  officer_name: '',
  officer_designation: '',
  officer_level: '',
  status: 'Feedback Pending',
  mobile_no: '',
  complainant_documents: '',
  remarks: '',
  file_link: '',
}
type FormType = typeof EMPTY_FORM

const STATUS_SUGGESTIONS = [
  'Feedback Pending', 'In Progress', 'Closed', 'Not Related',
  'प्रक्रियाधीन', 'निराकृत (फीडबैक लम्बित)', 'निराकृत (पॉजिटिव फीडबैक)',
]

function statusClasses(status: string) {
  const s = status || ''
  if (/निराकृत|Closed/i.test(s)) return 'text-green-700 bg-green-100'
  if (/प्रक्रियाधीन|In Progress/i.test(s)) return 'text-blue-700 bg-blue-100'
  if (/Not Related|असंबंधित/i.test(s)) return 'text-gray-600 bg-gray-100'
  if (/Pending|लंबित|लम्बित/i.test(s)) return 'text-amber-700 bg-amber-100'
  return 'text-gray-600 bg-gray-100'
}

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

const COLUMNS: ColumnDef[] = [
  { id: 'token_no', label: 'टोकन नंबर', sortKey: 'token_no' },
  { id: 'complaint_date', label: 'दिनांक', sortKey: 'complaint_date' },
  { id: 'category', label: 'श्रेणी' },
  { id: 'topic', label: 'विषय (Topic)', sortKey: 'topic' },
  { id: 'description', label: 'विवरण' },
  { id: 'district', label: 'जिला', sortKey: 'district' },
  { id: 'block', label: 'विकासखण्ड', sortKey: 'block' },
  { id: 'address', label: 'पता' },
  { id: 'login_user_id', label: 'लॉगिन आईडी' },
  { id: 'officer', label: 'अधिकारी', sortKey: 'officer_name' },
  { id: 'officer_level', label: 'स्तर', sortKey: 'officer_level' },
  { id: 'status', label: 'स्थिति', sortKey: 'status' },
  { id: 'activities', label: 'अधिकारी गतिविधि' },
  { id: 'resolved_date', label: 'निराकरण दिनांक', sortKey: 'resolved_date' },
  { id: 'owner_name', label: 'नाम (Owner)', sortKey: 'owner_name' },
  { id: 'mobile_no', label: 'मोबाइल', sortKey: 'mobile_no' },
  { id: 'complainant_documents', label: 'शिकायतकर्ता दस्तावेज़' },
  { id: 'file_link', label: 'फ़ाइल' },
  { id: 'remarks', label: 'टिप्पणी (Remarks)' },
]
const VISIBLE_COLS_STORAGE_KEY = 'complaints_v2_visible_columns'

type CellCtx = { onViewActivities: (e: ComplaintV2) => void }

const CELL_RENDERERS: Record<string, (e: ComplaintV2, ctx: CellCtx) => JSX.Element> = {
  token_no: e => <td className="px-3 py-2 text-xs font-mono font-semibold text-blue-900 whitespace-nowrap">{e.token_no}</td>,
  complaint_date: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{fromISODate(e.complaint_date) || '—'}</td>,
  category: e => <td className="px-3 py-2 text-xs max-w-[220px] truncate" title={e.category}>{e.category}</td>,
  topic: e => <td className="px-3 py-2 text-xs max-w-[220px] truncate" title={e.topic}>{e.topic || '—'}</td>,
  description: e => <td className="px-3 py-2 text-xs max-w-[520px] whitespace-pre-line">{e.description}</td>,
  district: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{e.district}</td>,
  block: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{e.block || '—'}</td>,
  address: e => <td className="px-3 py-2 text-xs max-w-[220px] truncate" title={e.address}>{e.address || '—'}</td>,
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
  activities: (e, ctx) => {
    const count = e.officer_activities?.length || 0
    return (
      <td className="px-3 py-2 text-xs whitespace-nowrap">
        <button
          onClick={() => ctx.onViewActivities(e)}
          className={`px-2 py-1 rounded text-xs font-medium ${count > 0 ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          📋 देखें ({count})
        </button>
      </td>
    )
  },
  resolved_date: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{fromISODate(e.resolved_date) || '—'}</td>,
  owner_name: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{e.owner_name || '—'}</td>,
  mobile_no: e => <td className="px-3 py-2 text-xs whitespace-nowrap">{e.mobile_no || '—'}</td>,
  complainant_documents: e => <td className="px-3 py-2 text-xs max-w-[220px] truncate" title={e.complainant_documents}>{e.complainant_documents || '—'}</td>,
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

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ComplaintsV2Page() {
  const [entries, setEntries] = useState<ComplaintV2[]>([])
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
  const [editEntry, setEditEntry] = useState<ComplaintV2 | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [activities, setActivities] = useState<OfficerActivity[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [viewingActivities, setViewingActivities] = useState<ComplaintV2 | null>(null)

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
    | { type: 'edit'; entry: ComplaintV2 }
    | { type: 'delete'; id: number }
    | { type: 'deleteAll' }>(null)

  useEffect(() => { fetchEntries() }, [])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await fetchAllRows<ComplaintV2>('complaints_v2', 'complaint_date', false)
    if (error) showMsg('error', error.message)
    else setEntries((data || []).map(e => ({ ...e, officer_activities: e.officer_activities || [] })))
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
        const hay = Object.values(e).filter(v => typeof v === 'string').join(' ').toLowerCase()
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

  function requestEdit(entry: ComplaintV2) { setPinAction({ type: 'edit', entry }) }
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
    setActivities([])
    setShowForm(true)
  }

  function openEdit(entry: ComplaintV2) {
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
      block: entry.block || '',
      address: entry.address || '',
      login_user_id: entry.login_user_id || '',
      officer_name: entry.officer_name || '',
      officer_designation: entry.officer_designation || '',
      officer_level: entry.officer_level || '',
      status: entry.status || 'Feedback Pending',
      mobile_no: entry.mobile_no || '',
      complainant_documents: entry.complainant_documents || '',
      remarks: entry.remarks || '',
      file_link: entry.file_link || '',
    })
    setActivities(entry.officer_activities || [])
    setShowForm(true)
  }

  function addActivity() {
    setActivities(prev => [...prev, { ...EMPTY_ACTIVITY }])
  }
  function removeActivity(idx: number) {
    setActivities(prev => prev.filter((_, i) => i !== idx))
  }
  function updateActivity(idx: number, field: keyof OfficerActivity, value: string) {
    setActivities(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a))
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      complaint_date: form.complaint_date || null,
      resolved_date: form.resolved_date || null,
      officer_activities: activities,
    }
    let error: any
    if (editEntry?.id) {
      ;({ error } = await supabase.from('complaints_v2').update(payload).eq('id', editEntry.id))
    } else {
      ;({ error } = await supabase.from('complaints_v2').insert(payload))
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
    const { error } = await supabase.from('complaints_v2').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'शिकायत हटाई गई।'); fetchEntries() }
  }

  async function handleDeleteAll() {
    setDeletingAll(true)
    const { error } = await supabase.from('complaints_v2').delete().neq('id', 0)
    setDeletingAll(false)
    setShowDeleteAll(false)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'सभी शिकायतें हटाई गईं।'); fetchEntries() }
  }

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

  // Basic-fields-only paste import (same two layouts as v1). Officer
  // activity history is added afterwards per-record via Edit.
  function parseBulkRows(text: string) {
    return mergeBulkLines(text)
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        let cols = line.split('\t')
        if (cols.length === 1) cols = line.split(',')
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
      block: row.block || '',
      address: row.address || '',
      login_user_id: row.login_user_id || '',
      officer_name: row.officer_name || '',
      officer_designation: row.officer_designation || '',
      officer_level: row.officer_level || '',
      status: row.status || 'Feedback Pending',
      mobile_no: row.mobile_no || '',
      complainant_documents: row.complainant_documents || '',
      remarks: row.remarks || '',
    }
  }

  async function importRows(parsed: ParsedComplaintRow[]) {
    if (parsed.length === 0) { showMsg('error', 'कोई मान्य पंक्ति नहीं मिली।'); return }

    setBulkSaving(true)
    setBulkLog(null)

    let toImport = parsed

    if (bulkMode === 'replace') {
      await supabase.from('complaints_v2').delete().neq('id', 0)
    } else {
      const existing = await fetchAllColumnValues('complaints_v2', 'token_no')
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

    const { error } = await supabase.from('complaints_v2').insert(toImport.map(r => ({ ...r, officer_activities: [] })))
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">शिकायत निवारण v2 (Complaints v2)</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} entries</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={requestDeleteAll} className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition">
              🗑️ Delete All
            </button>
            <button onClick={() => setShowBulk(true)} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              📥 Bulk Import
            </button>
            <button onClick={() => downloadJSON(entries, `complaints_v2_backup_${new Date().toISOString().slice(0, 10)}.json`)} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              📦 JSON Backup
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
            placeholder="खोजें... (नाम, टोकन, मोबाइल आदि)"
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
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm focus:outline-none" />
          </div>
          <div className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-2 py-1 bg-white">
            <span className="text-xs text-gray-500 whitespace-nowrap">तक</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm focus:outline-none" />
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
                      <Fragment key={col.id}>{CELL_RENDERERS[col.id](entry, { onViewActivities: setViewingActivities })}</Fragment>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 p-6">
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
                  <label className="block text-xs font-semibold text-gray-600 mb-1">विकासखण्ड</label>
                  <input type="text" value={form.block} onChange={e => setForm(f => ({ ...f, block: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">लॉगिन यूज़र आईडी</label>
                  <input type="text" value={form.login_user_id} onChange={e => setForm(f => ({ ...f, login_user_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">नागरिक मोबाइल</label>
                  <input type="text" value={form.mobile_no} onChange={e => setForm(f => ({ ...f, mobile_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">पता (Area / District / Block / GP / Village)</label>
                <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
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
                  <label className="block text-xs font-semibold text-gray-600 mb-1">निराकरण दिनांक</label>
                  <input type="date" value={form.resolved_date} onChange={e => setForm(f => ({ ...f, resolved_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">शिकायतकर्ता द्वारा संलग्न दस्तावेज़</label>
                <input type="text" value={form.complainant_documents} onChange={e => setForm(f => ({ ...f, complainant_documents: e.target.value }))}
                  placeholder="फ़ाइल नाम या लिंक"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
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
              </div>

              {/* Officer Activity Log */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-bold text-gray-700">अधिकारी गतिविधि (Officer Activity Log)</label>
                  <button type="button" onClick={addActivity} className="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-medium">
                    + Add Activity Level
                  </button>
                </div>
                {activities.length === 0 && (
                  <p className="text-xs text-gray-400">कोई गतिविधि नहीं जोड़ी गई। "+ Add Activity Level" से जोड़ें।</p>
                )}
                <div className="space-y-4">
                  {activities.map((act, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50 relative">
                      <button type="button" onClick={() => removeActivity(idx)}
                        className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200">Remove</button>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">स्तर (Level)</label>
                          <input type="text" value={act.level} onChange={e => updateActivity(idx, 'level', e.target.value)}
                            placeholder="L1, L2..."
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">दिनांक</label>
                          <input type="date" value={act.date} onChange={e => updateActivity(idx, 'date', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">नाम</label>
                          <input type="text" value={act.name} onChange={e => updateActivity(idx, 'name', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">पदनाम</label>
                          <input type="text" value={act.designation} onChange={e => updateActivity(idx, 'designation', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">मोबाइल</label>
                          <input type="text" value={act.mobile} onChange={e => updateActivity(idx, 'mobile', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">शिकायत की स्थिति</label>
                          <input list="status-suggestions" type="text" value={act.status} onChange={e => updateActivity(idx, 'status', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="block text-[11px] font-semibold text-gray-500 mb-1">अधिकारी समाधान</label>
                        <textarea value={act.resolution} onChange={e => updateActivity(idx, 'resolution', e.target.value)} rows={3}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 mb-1">अधिकारी द्वारा संलग्न दस्तावेज़</label>
                        <input type="text" value={act.documents} onChange={e => updateActivity(idx, 'documents', e.target.value)}
                          placeholder="फ़ाइल नाम (कॉमा से अलग करें)"
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                      </div>
                    </div>
                  ))}
                </div>
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

      {/* Read-only Activity Timeline Modal */}
      {viewingActivities && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-blue-900">अधिकारी गतिविधि</h2>
                <p className="text-xs text-gray-500 mt-0.5">टोकन: {viewingActivities.token_no}</p>
              </div>
              <button onClick={() => setViewingActivities(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            {(!viewingActivities.officer_activities || viewingActivities.officer_activities.length === 0) ? (
              <p className="text-sm text-gray-400 py-8 text-center">कोई गतिविधि दर्ज नहीं है।</p>
            ) : (
              <div className="space-y-4">
                {[...viewingActivities.officer_activities].reverse().map((act, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-blue-50 px-3 py-2 text-sm font-bold text-blue-900">
                      {act.level || '—'} {act.date && `(${fromISODate(act.date)})`}
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-t border-gray-100"><td className="px-3 py-2 font-semibold text-gray-500 w-1/3 align-top">स्तर</td><td className="px-3 py-2">{act.level || '—'}</td></tr>
                        <tr className="border-t border-gray-100"><td className="px-3 py-2 font-semibold text-gray-500 align-top">नाम</td><td className="px-3 py-2">{act.name || '—'}</td></tr>
                        <tr className="border-t border-gray-100"><td className="px-3 py-2 font-semibold text-gray-500 align-top">पदनाम</td><td className="px-3 py-2">{act.designation || '—'}</td></tr>
                        <tr className="border-t border-gray-100"><td className="px-3 py-2 font-semibold text-gray-500 align-top">मोबाइल</td><td className="px-3 py-2">{act.mobile || '—'}</td></tr>
                        <tr className="border-t border-gray-100"><td className="px-3 py-2 font-semibold text-gray-500 align-top">अधिकारी समाधान</td><td className="px-3 py-2 whitespace-pre-line">{act.resolution || '—'}</td></tr>
                        <tr className="border-t border-gray-100"><td className="px-3 py-2 font-semibold text-gray-500 align-top">शिकायत की स्थिति</td><td className="px-3 py-2">
                          <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${statusClasses(act.status)}`}>{act.status || '—'}</span>
                        </td></tr>
                        <tr className="border-t border-gray-100"><td className="px-3 py-2 font-semibold text-gray-500 align-top">अधिकारी द्वारा संलग्न दस्तावेज़</td><td className="px-3 py-2">{act.documents || '—'}</td></tr>
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-6">
              <button onClick={() => setViewingActivities(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition">बंद करें</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-2">Bulk Import Complaints v2</h2>

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
                Excel से पंक्तियाँ कॉपी-पेस्ट करें (Tab-separated) — केवल मूल fields इम्पोर्ट होंगे, अधिकारी गतिविधि हर रिकॉर्ड में बाद में Edit से जोड़ें:
                <br />• पुराना फॉर्मेट: टोकन, दिनांक, विभाग, विभागाध्यक्ष, श्रेणी, विवरण, जिला, लॉगिन आईडी, स्तर, स्थिति, मोबाइल
                <br />• नया फॉर्मेट: विभाग, विभागाध्यक्ष, जिला, टोकन, दिनांक, मेंड दिनांक, श्रेणी, विवरण, लॉगिन आईडी, अधिकारी नाम, अधिकारी पदनाम, स्तर, स्थिति
              </p>
            ) : (
              <p className="text-sm text-gray-500 mb-4">
                .xlsx/.xls फ़ाइल सीधे अपलोड करें — मूल fields (Token No, Owner Name, Category, Topic, District, Block, Address, Mobile No, Status, आदि) पहचाने जाते हैं। सिर्फ <strong>Token No</strong> ज़रूरी है। अधिकारी गतिविधि इस अपलोड में शामिल नहीं है — हर रिकॉर्ड में बाद में Edit से जोड़ें।
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
