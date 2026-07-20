'use client'

import { useEffect, useState } from 'react'
import { supabase, WorkDoneEntry } from '@/lib/supabase'

const EMPTY_FORM = {
  work_date: '',
  vehicle_no: '',
  work_done: '',
  brought_by: '',
  reference: '',
}

type FormType = typeof EMPTY_FORM

export default function WorkDonePage() {
  const [entries, setEntries] = useState<WorkDoneEntry[]>([])
  const [filtered, setFiltered] = useState<WorkDoneEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<WorkDoneEntry | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  useEffect(() => { fetchEntries() }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(entries); return }
    const s = search.trim().toLowerCase()
    setFiltered(entries.filter((e: any) =>
      e.vehicle_no?.toLowerCase().includes(s) ||
      e.work_done?.toLowerCase().includes(s) ||
      e.brought_by?.toLowerCase().includes(s)
    ))
  }, [entries, search])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await supabase
      .from('work_done_registry')
      .select('*')
      .order('work_date', { ascending: false })
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

  function openEdit(entry: WorkDoneEntry) {
    setEditEntry(entry)
    setForm({
      work_date: (entry as any).work_date || '',
      vehicle_no: (entry as any).vehicle_no || '',
      work_done: (entry as any).work_done || '',
      brought_by: (entry as any).brought_by || '',
      reference: (entry as any).reference || '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = { ...form, work_date: form.work_date || null }
    let error: any
    if (editEntry && (editEntry as any).id) {
      ;({ error } = await supabase.from('work_done_registry').update(payload).eq('id', (editEntry as any).id))
    } else {
      ;({ error } = await supabase.from('work_done_registry').insert(payload))
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
    const { error } = await supabase.from('work_done_registry').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Entry deleted.'); fetchEntries() }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Work Done Registry</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} entries</p>
          </div>
          <button onClick={openAdd} className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition">
            + Add Entry
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
            placeholder="Search by vehicle, work done, brought by..."
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
                  {['#', 'Date', 'Vehicle No', 'Work Done', 'Brought By', 'Reference', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No entries found</td></tr>
                ) : filtered.map((entry: any, i) => (
                  <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-xs text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.work_date || '—'}</td>
                    <td className="px-3 py-2 text-xs font-mono font-semibold text-blue-900">{entry.vehicle_no || '—'}</td>
                    <td className="px-3 py-2 text-xs max-w-xs" title={entry.work_done}>
                      <div className="line-clamp-2">{entry.work_done || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{entry.brought_by || '—'}</td>
                    <td className="px-3 py-2 text-xs">{entry.reference || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(entry)} className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium">Edit</button>
                        <button onClick={() => setDeleteId(entry.id)} className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">Del</button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-5">{editEntry ? 'Edit Entry' : 'Add New Entry'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Work Date</label>
                <input type="date" value={form.work_date} onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Vehicle No</label>
                <input type="text" value={form.vehicle_no} onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Brought By</label>
                <input type="text" value={form.brought_by} onChange={e => setForm(f => ({ ...f, brought_by: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Reference</label>
                <input type="text" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Work Done</label>
                <textarea
                  value={form.work_done}
                  onChange={e => setForm(f => ({ ...f, work_done: e.target.value }))}
                  rows={3}
                  placeholder="Describe the work done..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
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
