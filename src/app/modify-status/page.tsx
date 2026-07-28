'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase, ModifyStatus, fetchAllRows, fetchAllColumnValues } from '@/lib/supabase'
import { parseExcelFile } from '@/lib/excelImport'
import PinModal from '@/components/PinModal'

const EMPTY_FORM = {
  vehicle_no: '',
  mobile_no: '',
  correction_type: '',
  letter_no: '',
  letter_date: '',
  send_date: '',
  status: 'Pending',
  remarks: '',
  file_link: '',
}
type FormType = typeof EMPTY_FORM

const STATUS_SUGGESTIONS = ['Pending', 'Letter Sent', 'Completed', 'Rejected']
// Free-text field, but these are offered as datalist suggestions.
const CORRECTION_TYPE_SUGGESTIONS = [
  'Address Change', 'Owner Name Correction', 'Chassis No Correction',
  'Engine No Correction', 'Vehicle Class Correction', 'Other',
]

function statusClasses(status: string) {
  const s = status || ''
  if (/complet/i.test(s)) return 'text-green-700 bg-green-100'
  if (/reject/i.test(s)) return 'text-red-700 bg-red-100'
  if (/sent/i.test(s)) return 'text-blue-700 bg-blue-100'
  if (/pending/i.test(s)) return 'text-amber-700 bg-amber-100'
  return 'text-gray-600 bg-gray-100'
}

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

const EXCEL_HEADER_MAP: Record<string, string> = {
  vehicleno: 'vehicle_no', vehicle: 'vehicle_no',
  mobileno: 'mobile_no', mobile: 'mobile_no',
  correctiontype: 'correction_type', type: 'correction_type',
  letterno: 'letter_no', letter: 'letter_no',
  date: 'letter_date', letterdate: 'letter_date',
  senddate: 'send_date', sentdate: 'send_date',
  status: 'status',
  remarks: 'remarks',
  filelink: 'file_link', link: 'file_link',
}
const EXCEL_REQUIRED_FIELDS = ['vehicle_no']

export default function ModifyStatusPage() {
  const [entries, setEntries] = useState<ModifyStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<ModifyStatus | null>(null)
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
    | { type: 'edit'; entry: ModifyStatus }
    | { type: 'delete'; id: number }
    | { type: 'deleteAll' }>(null)

  useEffect(() => { fetchEntries() }, [])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await fetchAllRows<ModifyStatus>('modify_status', 'created_at', false)
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

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (statusFilter && e.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = Object.values(e).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [entries, search, statusFilter])

  function requestEdit(entry: ModifyStatus) { setPinAction({ type: 'edit', entry }) }
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

  function openEdit(entry: ModifyStatus) {
    setEditEntry(entry)
    setForm({
      vehicle_no: entry.vehicle_no || '',
      mobile_no: entry.mobile_no || '',
      correction_type: entry.correction_type || '',
      letter_no: entry.letter_no || '',
      letter_date: entry.letter_date || '',
      send_date: entry.send_date || '',
      status: entry.status || 'Pending',
      remarks: entry.remarks || '',
      file_link: entry.file_link || '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      letter_date: form.letter_date || null,
      send_date: form.send_date || null,
    }
    let error: any
    if (editEntry?.id) {
      ;({ error } = await supabase.from('modify_status').update(payload).eq('id', editEntry.id))
    } else {
      ;({ error } = await supabase.from('modify_status').insert(payload))
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
    const { error } = await supabase.from('modify_status').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Entry deleted.'); fetchEntries() }
  }

  async function handleDeleteAll() {
    setDeletingAll(true)
    const { error } = await supabase.from('modify_status').delete().neq('id', 0)
    setDeletingAll(false)
    setShowDeleteAll(false)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'All records deleted.'); fetchEntries() }
  }

  // Parses rows pasted from Excel (tab-separated), optional leading serial
  // column: VehicleNo, MobileNo, CorrectionType, LetterNo, Date, SendDate, Status, Remarks
  function parseBulkRows(text: string) {
    return text
      .split(/\r?\n/)
      .filter(l => l.replace(/\t/g, '').trim() !== '')
      .filter(l => !/vehicle\s*no/i.test(l)) // skip header row
      .map(line => {
        let cols = line.split('\t')
        if (cols.length === 1) cols = line.split(',')
        if (cols.length >= 6 && /^\d+$/.test(cols[0].trim())) cols = cols.slice(1)
        cols = cols.map(c => c.trim())
        if (cols.length < 2) return null
        const [vehicle_no, mobile_no, correction_type, letter_no, letterDate, sendDate, status, remarks] = cols
        if (!vehicle_no) return null
        return {
          vehicle_no, mobile_no: mobile_no || '', correction_type: correction_type || '',
          letter_no: letter_no || '', letter_date: toISODate(letterDate || ''),
          send_date: toISODate(sendDate || ''), status: status || 'Pending', remarks: remarks || '',
        }
      })
      .filter((r): r is NonNullable<typeof r> => !!r && !!r.vehicle_no)
  }

  function excelRowToParsedRow(row: Record<string, string>) {
    const vehicle_no = (row.vehicle_no || '').trim()
    if (!vehicle_no) return null
    return {
      vehicle_no,
      mobile_no: row.mobile_no || '',
      correction_type: row.correction_type || '',
      letter_no: row.letter_no || '',
      letter_date: toISODate(row.letter_date || ''),
      send_date: toISODate(row.send_date || ''),
      status: row.status || 'Pending',
      remarks: row.remarks || '',
      file_link: row.file_link || '',
    }
  }

  async function importRows(parsed: ReturnType<typeof parseBulkRows>) {
    if (parsed.length === 0) { showMsg('error', 'No valid rows found.'); return }

    setBulkSaving(true)
    setBulkLog(null)

    let toImport = parsed

    if (bulkMode === 'replace') {
      await supabase.from('modify_status').delete().neq('id', 0)
    } else {
      const existing = await fetchAllColumnValues('modify_status', 'vehicle_no')
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

    const { error } = await supabase.from('modify_status').insert(toImport)
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
    if (bulkText.trim() && !bulkText.includes('\t')) {
      showMsg('error', 'यह डेटा Tab-separated नहीं लग रहा। कृपया Excel से कॉपी करके पेस्ट करें, या "+ Add Entry" इस्तेमाल करें।')
      return
    }
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
    const parsed = result.rows.map(excelRowToParsedRow).filter((r): r is NonNullable<typeof r> => !!r)
    setBulkSaving(false)
    await importRows(parsed)
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 no-print">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Modify Status</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} entries</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={requestDeleteAll} className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition">
              🗑️ Delete All
            </button>
            <button onClick={() => setShowBulk(true)} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              📥 Bulk Import
            </button>
            <button onClick={() => downloadJSON(entries, `modify_status_backup_${new Date().toISOString().slice(0, 10)}.json`)} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              📦 JSON Backup
            </button>
            <button onClick={() => window.print()} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              🖨 Print
            </button>
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

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4 no-print">
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
            <div className="text-xl font-bold text-blue-900">{entries.length}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">कुल एंट्री</div>
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
            placeholder="Search by vehicle no, mobile, letter no..."
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
                  {['#', 'Vehicle No', 'Mobile No', 'Correction Type', 'Letter No', 'Date', 'Send Date', 'Status', 'Remarks', 'File', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-10 text-gray-400">No entries found</td></tr>
                ) : filtered.map((entry, i) => (
                  <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-xs text-gray-500">{entries.findIndex(e => e.id === entry.id) + 1}</td>
                    <td className="px-3 py-2 text-xs font-mono font-semibold text-blue-900 whitespace-nowrap">{entry.vehicle_no}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.mobile_no || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.correction_type || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.letter_no || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{fromISODate(entry.letter_date) || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{fromISODate(entry.send_date) || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${statusClasses(entry.status)}`}>{entry.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[220px] whitespace-pre-line">{entry.remarks || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {entry.file_link ? (
                        <a href={entry.file_link} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200 text-xs font-medium">
                          📎 Open
                        </a>
                      ) : '—'}
                    </td>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-5">{editEntry ? 'Edit Entry' : 'Add New Entry'}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Vehicle No</label>
                  <input type="text" value={form.vehicle_no} onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Mobile No</label>
                  <input type="text" value={form.mobile_no} onChange={e => setForm(f => ({ ...f, mobile_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Correction Type</label>
                  <input list="correction-type-suggestions" type="text" value={form.correction_type} onChange={e => setForm(f => ({ ...f, correction_type: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  <datalist id="correction-type-suggestions">
                    {CORRECTION_TYPE_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <input list="status-suggestions" type="text" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  <datalist id="status-suggestions">
                    {STATUS_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Letter No</label>
                  <input type="text" value={form.letter_no} onChange={e => setForm(f => ({ ...f, letter_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
                  <input type="date" value={form.letter_date} onChange={e => setForm(f => ({ ...f, letter_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Send Date</label>
                  <input type="date" value={form.send_date} onChange={e => setForm(f => ({ ...f, send_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks</label>
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
            <h2 className="text-lg font-bold text-blue-900 mb-2">Bulk Import Modify Status</h2>

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
                Excel से पंक्तियाँ कॉपी-पेस्ट करें (Tab-separated): Vehicle No, Mobile No, Correction Type, Letter No, Date, Send Date, Status, Remarks — हेडर रो और क्रमांक कॉलम अपने आप हट जाएंगे।
              </p>
            ) : (
              <p className="text-sm text-gray-500 mb-4">
                .xlsx/.xls फ़ाइल सीधे अपलोड करें। सिर्फ <strong>Vehicle No</strong> ज़रूरी है — बाकी कॉलम पहचाने जाते हैं, अनजान कॉलम नज़रअंदाज़ हो जाते हैं।
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
                  placeholder="CG05AP2390&#9;9999999999&#9;Address Change&#9;LTR123&#9;15-07-2026&#9;&#9;Pending"
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
          action={pinAction.type === 'edit' ? 'edit this entry' : pinAction.type === 'delete' ? 'delete this entry' : 'delete ALL records'}
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
    </div>
  )
}
