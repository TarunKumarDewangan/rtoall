'use client'

import { useEffect, useState } from 'react'
import { supabase, BacklogEntry } from '@/lib/supabase'

const STATUS_OPTIONS = ['Pending', 'Whitelisted', 'Done', 'Sent', 'SEND INCOMPLETE', 'WHITELISTED BUT DOCINCOM']

const STATUS_COLORS: Record<string, string> = {
  Done: 'bg-green-100 text-green-800',
  Sent: 'bg-blue-100 text-blue-800',
  Whitelisted: 'bg-purple-100 text-purple-800',
  'SEND INCOMPLETE': 'bg-red-100 text-red-800',
  'WHITELISTED BUT DOCINCOM': 'bg-orange-100 text-orange-800',
  Pending: 'bg-yellow-100 text-yellow-800',
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

  useEffect(() => {
    fetchEntries()
  }, [])

  useEffect(() => {
    let data = [...entries]
    if (statusFilter !== 'All') {
      data = data.filter(e => e.letter_status === statusFilter)
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      data = data.filter(e => e.vehicle_no.toLowerCase().includes(s))
    }
    setFiltered(data)
  }, [entries, statusFilter, search])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await supabase
      .from('backlog_entries')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) showMsg('error', error.message)
    else setEntries(data || [])
    setLoading(false)
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  function openAdd() {
    setEditEntry(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(entry: BacklogEntry) {
    setEditEntry(entry)
    const { id, created_at, ...rest } = entry
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
    else {
      showMsg('success', 'Entry deleted.')
      fetchEntries()
    }
  }

  function yesNoBadge(val: string) {
    return val === 'YES'
      ? <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">YES</span>
      : <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">NO</span>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Backlog Entries</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} records</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 rounded-lg border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition"
            >
              Print
            </button>
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
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm print:shadow-none">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-blue-900 text-white">
                  {['#', 'Date', 'Vehicle No', 'Given By', 'Mobile', 'Chassis', 'Engine', 'F22', 'F21', 'INV', 'RC', '1stINC', 'Work Needed', 'Remarks', 'Letter No', 'Letter Date', 'Send Date', 'Status', 'Print Lot', 'Actions'].map(h => (
                    <th key={h} className="px-2 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={20} className="text-center py-10 text-gray-400">No records found</td></tr>
                ) : filtered.map((entry, i) => (
                  <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
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
                    <td className="px-2 py-2 print:hidden">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(entry)} className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium">Edit</button>
                        <button onClick={() => setDeleteId(entry.id!)} className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
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
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              ))}

              {YES_NO_FIELDS.map(key => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{key.replace('_', ' ').toUpperCase()}</label>
                  <select
                    value={(form as any)[key]}
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
                <input
                  type="text"
                  value={form.work_needed}
                  onChange={e => setForm(f => ({ ...f, work_needed: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks</label>
                <textarea
                  value={form.remarks}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              {[
                { label: 'Letter Making Date', key: 'letter_making_date', type: 'date' },
                { label: 'Letter No', key: 'letter_no', type: 'text' },
                { label: 'Letter Sending Date', key: 'letter_sending_date', type: 'date' },
                { label: 'Print Lot', key: 'print_lot', type: 'text' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                  <input
                    type={type}
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Letter Status</label>
                <select
                  value={form.letter_status}
                  onChange={e => setForm(f => ({ ...f, letter_status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
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

      {/* Delete Confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-red-700 mb-2">Confirm Delete</h3>
            <p className="text-sm text-gray-600 mb-5">Are you sure you want to delete this entry? This action cannot be undone.</p>
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
