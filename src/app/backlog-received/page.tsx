'use client'

import { useEffect, useState } from 'react'
import { supabase, BacklogReceived } from '@/lib/supabase'
import PinModal from '@/components/PinModal'

const EMPTY_FORM = {
  transaction_type: '',
  received_date: '',
  given_by: '',
  given_to: '',
  mobile_no: '',
  vehicle_no: '',
  remarks: '',
  work_needed: '',
  purpose: '',
}

type FormType = typeof EMPTY_FORM

export default function BacklogReceivedPage() {
  const [entries, setEntries] = useState<BacklogReceived[]>([])
  const [filtered, setFiltered] = useState<BacklogReceived[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<BacklogReceived | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [pinAction, setPinAction] = useState<null | { type: 'edit'; entry: BacklogReceived } | { type: 'delete'; id: number }>(null)

  useEffect(() => { fetchEntries() }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(entries); return }
    const s = search.trim().toLowerCase()
    setFiltered(entries.filter(e =>
      e.vehicle_no?.toLowerCase().includes(s) ||
      e.given_by?.toLowerCase().includes(s) ||
      e.given_to?.toLowerCase().includes(s)
    ))
  }, [entries, search])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await supabase
      .from('backlog_received')
      .select('*')
      .order('received_date', { ascending: false })
    if (error) showMsg('error', error.message)
    else setEntries(data || [])
    setLoading(false)
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  function requestEdit(entry: BacklogReceived) { setPinAction({ type: 'edit', entry }) }
  function requestDelete(id: number) { setPinAction({ type: 'delete', id }) }
  function onPinSuccess() {
    if (!pinAction) return
    if (pinAction.type === 'edit') openEdit(pinAction.entry)
    else if (pinAction.type === 'delete') setDeleteId(pinAction.id)
    setPinAction(null)
  }

  function openAdd() {
    setEditEntry(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(entry: BacklogReceived) {
    setEditEntry(entry)
    setForm({
      transaction_type: (entry as any).transaction_type || '',
      received_date: (entry as any).received_date || '',
      given_by: (entry as any).given_by || '',
      given_to: (entry as any).given_to || '',
      mobile_no: (entry as any).mobile_no || '',
      vehicle_no: (entry as any).vehicle_no || '',
      remarks: (entry as any).remarks || '',
      work_needed: (entry as any).work_needed || '',
      purpose: (entry as any).purpose || '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      received_date: form.received_date || null,
    }
    let error: any
    if (editEntry && (editEntry as any).id) {
      ;({ error } = await supabase.from('backlog_received').update(payload).eq('id', (editEntry as any).id))
    } else {
      ;({ error } = await supabase.from('backlog_received').insert(payload))
    }
    setSaving(false)
    if (error) showMsg('error', error.message)
    else {
      showMsg('success', editEntry ? 'Record updated!' : 'Record added!')
      setShowForm(false)
      fetchEntries()
    }
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from('backlog_received').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Record deleted.'); fetchEntries() }
  }

  const fields: { label: string; key: keyof FormType; type: string }[] = [
    { label: 'Transaction Type', key: 'transaction_type', type: 'text' },
    { label: 'Received Date', key: 'received_date', type: 'date' },
    { label: 'Given By', key: 'given_by', type: 'text' },
    { label: 'Given To', key: 'given_to', type: 'text' },
    { label: 'Mobile No', key: 'mobile_no', type: 'text' },
    { label: 'Vehicle No', key: 'vehicle_no', type: 'text' },
    { label: 'Work Needed', key: 'work_needed', type: 'text' },
    { label: 'Purpose', key: 'purpose', type: 'text' },
    { label: 'Remarks', key: 'remarks', type: 'text' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Backlog Received</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} records</p>
          </div>
          <button onClick={openAdd} className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition">
            + Add Record
          </button>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by vehicle, given by, given to..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-blue-900 text-white">
                  {['#', 'Type', 'Date', 'Given By', 'Given To', 'Mobile', 'Vehicle No', 'Work Needed', 'Purpose', 'Remarks', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-10 text-gray-400">No records found</td></tr>
                ) : filtered.map((entry: any, i) => (
                  <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-gray-500 text-xs">{entries.findIndex(e => e.id === entry.id) + 1}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">{entry.transaction_type || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.received_date || '—'}</td>
                    <td className="px-3 py-2 text-xs">{entry.given_by || '—'}</td>
                    <td className="px-3 py-2 text-xs">{entry.given_to || '—'}</td>
                    <td className="px-3 py-2 text-xs">{entry.mobile_no || '—'}</td>
                    <td className="px-3 py-2 text-xs font-mono font-semibold text-blue-900">{entry.vehicle_no || '—'}</td>
                    <td className="px-3 py-2 text-xs max-w-xs truncate" title={entry.work_needed}>{entry.work_needed || '—'}</td>
                    <td className="px-3 py-2 text-xs">{entry.purpose || '—'}</td>
                    <td className="px-3 py-2 text-xs max-w-xs truncate" title={entry.remarks}>{entry.remarks || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex gap-1">
                        <button onClick={() => requestEdit(entry)} className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium">Edit</button>
                        <button onClick={() => requestDelete(entry.id)} className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">Del</button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-5">{editEntry ? 'Edit Record' : 'Add New Record'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map(({ label, key, type }) => (
                <div key={key} className={key === 'remarks' || key === 'work_needed' ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                  {key === 'remarks' || key === 'work_needed' ? (
                    <textarea
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      rows={2}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  ) : (
                    <input
                      type={type}
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  )}
                </div>
              ))}
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
          action={pinAction.type === 'edit' ? 'edit this record' : 'delete this record'}
          onSuccess={onPinSuccess}
          onCancel={() => setPinAction(null)}
        />
      )}

      {/* Delete Confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-red-700 mb-2">Confirm Delete</h3>
            <p className="text-sm text-gray-600 mb-5">Are you sure you want to delete this record?</p>
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
