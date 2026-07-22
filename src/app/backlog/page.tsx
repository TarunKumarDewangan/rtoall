'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, BacklogEntry } from '@/lib/supabase'
import PinModal from '@/components/PinModal'

const STATUS_OPTIONS = ['Pending', 'Whitelisted', 'Done', 'Sent', 'SEND INCOMPLETE', 'WHITELISTED BUT DOCINCOM', 'LetterMaking']

const STATUS_COLORS: Record<string, string> = {
  Done: 'bg-green-100 text-green-800',
  Sent: 'bg-blue-100 text-blue-800',
  Whitelisted: 'bg-purple-100 text-purple-800',
  'SEND INCOMPLETE': 'bg-red-100 text-red-800',
  'WHITELISTED BUT DOCINCOM': 'bg-orange-100 text-orange-800',
  Pending: 'bg-yellow-100 text-yellow-800',
  LetterMaking: 'bg-cyan-100 text-cyan-800',
}

const YES_NO_FIELDS = ['form22', 'form21', 'invoice', 'rc', 'first_inc'] as const

const EMPTY_FORM: Omit<BacklogEntry, 'id' | 'created_at'> = {
  received_date: '',
  given_by: '',
  mobile_no: '',
  vehicle_no: '',
  chassis_no: '',
  engine_no: '',
  form22: 'NO',
  form21: 'NO',
  invoice: 'NO',
  rc: 'NO',
  first_inc: 'NO',
  work_needed: '',
  remarks: '',
  letter_making_date: '',
  letter_no: '',
  letter_sending_date: '',
  letter_status: 'Pending',
  print_lot: '',
}

export default function BacklogPage() {
  const [entries, setEntries] = useState<BacklogEntry[]>([])
  const [filtered, setFiltered] = useState<BacklogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<BacklogEntry | null>(null)
  const [form, setForm] = useState<Omit<BacklogEntry, 'id' | 'created_at'>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [pinAction, setPinAction] = useState<null | { type: 'edit'; entry: BacklogEntry } | { type: 'delete'; id: number }>(null)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('backlog_entries')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) showMsg('error', error.message)
    else setEntries(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  useEffect(() => {
    let data = [...entries]
    if (statusFilter !== 'All') data = data.filter(e => e.letter_status === statusFilter)
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      data = data.filter(e => e.vehicle_no.toLowerCase().includes(s))
    }
    setFiltered(data)
    setSelected(new Set())
  }, [entries, statusFilter, search])

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(e => e.id!)))
    }
  }

  function getSelectedEntries() {
    return filtered.filter(e => selected.has(e.id!))
  }

  function printSelected() {
    const rows = getSelectedEntries()
    if (rows.length === 0) { showMsg('error', 'No rows selected!'); return }
    const html = `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<title>पंजीकृत वाहनों के बैकलॉग रिपोर्ट</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&display=swap');
  @page { size: A4 landscape; margin: 15mm; }
  body { font-family: 'Noto Sans Devanagari', sans-serif; margin: 20px; line-height: 1.5; }
  h2 { text-align: center; text-decoration: underline; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; margin-top: 20px; font-size: 13px; }
  th, td { border: 1px solid #000; padding: 7px 10px; text-align: center; word-break: break-word; }
  th { background: #f2f2f2; }
  .footer-container { text-align: right; margin-top: 80px; }
  .signature-block { display: inline-block; text-align: center; font-weight: bold; font-size: 18px; }
  .print-btn { display: inline-block; background: #007bff; color: white; padding: 10px 25px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="no-print" style="text-align:center; margin-bottom: 20px;">
  <button class="print-btn" onclick="window.print()">🖨️ Print this page</button>
</div>
<h2>पंजीकृत वाहनों के बैकलॉग प्रविष्टि हेतु जानकारी</h2>
<table>
  <thead>
    <tr>
      <th>S.No</th>
      <th>Vehicle No</th>
      <th>Chassis No</th>
      <th>Engine No</th>
      <th>Form 22</th>
      <th>Form 21</th>
      <th>Invoice</th>
      <th>1st INC</th>
      <th>Remarks</th>
    </tr>
  </thead>
  <tbody>
    ${rows.map((e, i) => `<tr>
      <td>${i + 1}</td>
      <td>${e.vehicle_no}</td>
      <td>${e.chassis_no}</td>
      <td>${e.engine_no}</td>
      <td>${e.form22}</td>
      <td>${e.form21}</td>
      <td>${e.invoice}</td>
      <td>${e.first_inc}</td>
      <td>${e.remarks ? e.remarks.replace(/\n/g, '<br>') : '-'}</td>
    </tr>`).join('')}
  </tbody>
</table>
<div class="footer-container">
  <div class="signature-block">
    जिला परिवहन अधिकारी,<br>
    धमतरी (छ.ग.)
  </div>
</div>
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); w.print() }
  }

  function exportToExcel() {
    const rows = getSelectedEntries()
    if (rows.length === 0) { showMsg('error', 'No rows selected!'); return }

    const headers = ['ID','Received Date','Vehicle No','Given By','Mobile','Chassis No','Engine No',
      'Form22','Form21','Invoice','RC','1st INC','Work Needed','Remarks',
      'Letter No','Letter Making Date','Letter Sending Date','Letter Status','Print Lot']

    const csvRows = [
      headers.join(','),
      ...rows.map(e => [
        e.id, e.received_date, e.vehicle_no, e.given_by, e.mobile_no,
        e.chassis_no, e.engine_no, e.form22, e.form21, e.invoice, e.rc, e.first_inc,
        `"${(e.work_needed || '').replace(/"/g, '""')}"`,
        `"${(e.remarks || '').replace(/"/g, '""')}"`,
        e.letter_no, e.letter_making_date, e.letter_sending_date,
        e.letter_status, e.print_lot
      ].join(','))
    ]
    const csv = csvRows.join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backlog_entries_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function openAdd() {
    setEditEntry(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function requestEdit(entry: BacklogEntry) {
    setPinAction({ type: 'edit', entry })
  }

  function requestDelete(id: number) {
    setPinAction({ type: 'delete', id })
  }

  function onPinSuccess() {
    if (!pinAction) return
    if (pinAction.type === 'edit') {
      openEdit(pinAction.entry)
    } else if (pinAction.type === 'delete') {
      setDeleteId(pinAction.id)
    }
    setPinAction(null)
  }

  function openEdit(entry: BacklogEntry) {
    setEditEntry(entry)
    const { id: _id, created_at: _ca, ...rest } = entry
    setForm({
      ...rest,
      received_date: rest.received_date || '',
      letter_making_date: rest.letter_making_date || '',
      letter_sending_date: rest.letter_sending_date || '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      received_date: form.received_date || null,
      letter_making_date: form.letter_making_date || null,
      letter_sending_date: form.letter_sending_date || null,
    }
    let error
    if (editEntry?.id) {
      ;({ error } = await supabase.from('backlog_entries').update(payload).eq('id', editEntry.id))
    } else {
      ;({ error } = await supabase.from('backlog_entries').insert(payload))
    }
    setSaving(false)
    if (error) {
      showMsg('error', error.message)
    } else {
      showMsg('success', editEntry ? 'Entry updated!' : 'Entry added!')
      setShowForm(false)
      fetchEntries()
    }
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from('backlog_entries').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Entry deleted.'); fetchEntries() }
  }

  function yesNoBadge(val: string) {
    return val === 'YES'
      ? <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">YES</span>
      : <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">NO</span>
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length
  const someSelected = selected.size > 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Backlog Entries</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Total: {filtered.length} records
              {someSelected && <span className="ml-2 text-blue-700 font-semibold">({selected.size} selected)</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {someSelected && (
              <>
                <button
                  onClick={printSelected}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition flex items-center gap-1"
                >
                  🖨️ Print Selected ({selected.size})
                </button>
                <button
                  onClick={exportToExcel}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition flex items-center gap-1"
                >
                  📊 Export to Excel ({selected.size})
                </button>
              </>
            )}
            <button
              onClick={openAdd}
              className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition"
            >
              + Add Entry
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by Vehicle No..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="All">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 cursor-pointer"
                      title="Select All"
                    />
                  </th>
                  {['#', 'Date', 'Vehicle No', 'Given By', 'Mobile', 'Chassis', 'Engine', 'F22', 'F21', 'INV', 'RC', '1stINC', 'Work Needed', 'Remarks', 'Letter No', 'Letter Date', 'Send Date', 'Status', 'Print Lot', 'Actions'].map(h => (
                    <th key={h} className="px-2 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={21} className="text-center py-10 text-gray-400">No records found</td></tr>
                ) : filtered.map((entry, i) => {
                  const isSelected = selected.has(entry.id!)
                  return (
                    <tr key={entry.id} className={isSelected ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(entry.id!)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{entry.received_date || '—'}</td>
                      <td className="px-2 py-2 font-mono font-semibold text-blue-900">{entry.vehicle_no}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{entry.given_by}</td>
                      <td className="px-2 py-2">{entry.mobile_no}</td>
                      <td className="px-2 py-2 font-mono text-gray-600">{entry.chassis_no}</td>
                      <td className="px-2 py-2 font-mono text-gray-600">{entry.engine_no}</td>
                      <td className="px-2 py-2">{yesNoBadge(entry.form22)}</td>
                      <td className="px-2 py-2">{yesNoBadge(entry.form21)}</td>
                      <td className="px-2 py-2">{yesNoBadge(entry.invoice)}</td>
                      <td className="px-2 py-2">{yesNoBadge(entry.rc)}</td>
                      <td className="px-2 py-2">{yesNoBadge(entry.first_inc)}</td>
                      <td className="px-2 py-2 max-w-32 truncate" title={entry.work_needed}>{entry.work_needed}</td>
                      <td className="px-2 py-2 max-w-32 truncate" title={entry.remarks}>{entry.remarks}</td>
                      <td className="px-2 py-2 font-mono">{entry.letter_no}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{entry.letter_making_date || '—'}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{entry.letter_sending_date || '—'}</td>
                      <td className="px-2 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_COLORS[entry.letter_status] || 'bg-gray-100 text-gray-700'}`}>
                          {entry.letter_status}
                        </span>
                      </td>
                      <td className="px-2 py-2">{entry.print_lot}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => requestEdit(entry)} className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 hover:bg-yellow-200 text-xs font-medium">Edit</button>
                          <button onClick={() => requestDelete(entry.id!)} className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">Del</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-5">{editEntry ? 'Edit Entry' : 'Add New Entry'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Received Date', key: 'received_date', type: 'date' },
                { label: 'Given By', key: 'given_by', type: 'text' },
                { label: 'Mobile No', key: 'mobile_no', type: 'text' },
                { label: 'Vehicle No', key: 'vehicle_no', type: 'text' },
                { label: 'Chassis No', key: 'chassis_no', type: 'text' },
                { label: 'Engine No', key: 'engine_no', type: 'text' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                  <input
                    type={type}
                    value={String(form[key as keyof typeof form] ?? '')}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              ))}

              {YES_NO_FIELDS.map(key => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{key.replace('_', ' ').toUpperCase()}</label>
                  <select
                    value={String(form[key])}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="YES">YES</option>
                    <option value="NO">NO</option>
                  </select>
                </div>
              ))}

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Work Needed</label>
                <input type="text" value={form.work_needed} onChange={e => setForm(f => ({ ...f, work_needed: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              {[
                { label: 'Letter Making Date', key: 'letter_making_date', type: 'date' },
                { label: 'Letter No', key: 'letter_no', type: 'text' },
                { label: 'Letter Sending Date', key: 'letter_sending_date', type: 'date' },
                { label: 'Print Lot', key: 'print_lot', type: 'text' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                  <input type={type} value={String(form[key as keyof typeof form] ?? '')}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              ))}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Letter Status</label>
                <select value={form.letter_status} onChange={e => setForm(f => ({ ...f, letter_status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
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

      {/* PIN Modal */}
      {pinAction && (
        <PinModal
          action={pinAction.type === 'edit' ? 'edit this entry' : 'delete this entry'}
          onSuccess={onPinSuccess}
          onCancel={() => setPinAction(null)}
        />
      )}

      {/* Delete Confirm */}
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
    </div>
  )
}
