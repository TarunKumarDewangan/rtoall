'use client'

import { useEffect, useState } from 'react'
import { supabase, SubsidyEntry } from '@/lib/supabase'

const BOOL_FIELDS = ['has_receipt', 'has_invoice', 'has_passbook', 'has_aadhaar', 'has_rc'] as const
type BoolField = typeof BOOL_FIELDS[number]

const EMPTY_FORM = {
  vehicle_no: '',
  date_submitted: '',
  entry_by: '',
  has_receipt: false,
  has_invoice: false,
  has_passbook: false,
  has_aadhaar: false,
  has_rc: false,
}

type FormType = typeof EMPTY_FORM

function DocIcon({ val }: { val: boolean }) {
  return val
    ? <span className="text-green-600 font-bold text-base">✓</span>
    : <span className="text-red-400 text-base">✗</span>
}

export default function SubsidyPage() {
  const [entries, setEntries] = useState<SubsidyEntry[]>([])
  const [filtered, setFiltered] = useState<SubsidyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<SubsidyEntry | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  // Bulk import state
  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkDate, setBulkDate] = useState('')
  const [bulkBy, setBulkBy] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMode, setBulkMode] = useState<'skip' | 'replace'>('skip')
  const [bulkLog, setBulkLog] = useState<string | null>(null)

  useEffect(() => { fetchEntries() }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(entries); return }
    const s = search.trim().toLowerCase()
    setFiltered(entries.filter((e: any) => e.vehicle_no?.toLowerCase().includes(s)))
  }, [entries, search])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await supabase
      .from('subsidy_entries')
      .select('*')
      .order('date_submitted', { ascending: false })
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

  function openEdit(entry: SubsidyEntry) {
    setEditEntry(entry)
    setForm({
      vehicle_no: (entry as any).vehicle_no || '',
      date_submitted: (entry as any).date_submitted || '',
      entry_by: (entry as any).entry_by || '',
      has_receipt: !!(entry as any).has_receipt,
      has_invoice: !!(entry as any).has_invoice,
      has_passbook: !!(entry as any).has_passbook,
      has_aadhaar: !!(entry as any).has_aadhaar,
      has_rc: !!(entry as any).has_rc,
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = { ...form, date_submitted: form.date_submitted || null }
    let error: any
    if (editEntry && (editEntry as any).id) {
      ;({ error } = await supabase.from('subsidy_entries').update(payload).eq('id', (editEntry as any).id))
    } else {
      ;({ error } = await supabase.from('subsidy_entries').insert(payload))
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
    const { error } = await supabase.from('subsidy_entries').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Entry deleted.'); fetchEntries() }
  }

  async function handleBulkImport() {
    const allVehicles = bulkText
      .split(/[\n,]+/)
      .map(v => v.trim().toUpperCase())
      .filter(v => v.length > 0)

    if (allVehicles.length === 0) { showMsg('error', 'No vehicle numbers found.'); return }

    setBulkSaving(true)
    setBulkLog(null)

    let toImport = allVehicles

    if (bulkMode === 'replace') {
      // Delete all existing records first
      await supabase.from('subsidy_entries').delete().neq('id', 0)
    } else {
      // Skip mode: fetch existing vehicle numbers and filter them out
      const { data: existing } = await supabase
        .from('subsidy_entries')
        .select('vehicle_no')
      const existingSet = new Set((existing || []).map((e: { vehicle_no: string }) => e.vehicle_no.toUpperCase()))
      const skipped = allVehicles.filter(v => existingSet.has(v))
      toImport = allVehicles.filter(v => !existingSet.has(v))
      if (skipped.length > 0) {
        setBulkLog(`Skipped ${skipped.length} already existing: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '...' : ''}`)
      }
    }

    if (toImport.length === 0) {
      setBulkSaving(false)
      showMsg('error', 'All vehicle numbers already exist! Nothing to import.')
      return
    }

    const rows = toImport.map(vehicle_no => ({
      vehicle_no,
      date_submitted: bulkDate || null,
      entry_by: bulkBy,
      has_receipt: false,
      has_invoice: false,
      has_passbook: false,
      has_aadhaar: false,
      has_rc: false,
    }))

    const { error } = await supabase.from('subsidy_entries').insert(rows)
    setBulkSaving(false)
    if (error) showMsg('error', error.message)
    else {
      showMsg('success', `${toImport.length} entries imported successfully!`)
      setShowBulk(false)
      setBulkText('')
      setBulkDate('')
      setBulkBy('')
      setBulkLog(null)
      fetchEntries()
    }
  }

  const docLabels: Record<BoolField, string> = {
    has_receipt: 'Receipt',
    has_invoice: 'Invoice',
    has_passbook: 'Passbook',
    has_aadhaar: 'Aadhaar',
    has_rc: 'RC',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Subsidy Entries</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} entries</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowBulk(true)} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              Bulk Import
            </button>
            <button onClick={openAdd} className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition">
              + Add Entry
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by vehicle no..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-blue-900 text-white">
                  {['#', 'Vehicle No', 'Date Submitted', 'Entry By', 'Receipt', 'Invoice', 'Passbook', 'Aadhaar', 'RC', 'Doc Score', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-10 text-gray-400">No entries found</td></tr>
                ) : filtered.map((entry: any, i) => {
                  const score = BOOL_FIELDS.filter(f => entry[f]).length
                  return (
                    <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-xs text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-mono font-semibold text-blue-900">{entry.vehicle_no}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.date_submitted || '—'}</td>
                      <td className="px-3 py-2 text-xs">{entry.entry_by || '—'}</td>
                      {BOOL_FIELDS.map(f => (
                        <td key={f} className="px-3 py-2 text-center"><DocIcon val={!!entry[f]} /></td>
                      ))}
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-2 py-0.5 rounded-full font-semibold text-xs ${score === 5 ? 'bg-green-100 text-green-800' : score >= 3 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                          {score}/5
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(entry)} className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium">Edit</button>
                          <button onClick={() => setDeleteId(entry.id)} className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">Del</button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-5">{editEntry ? 'Edit Entry' : 'Add New Entry'}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Vehicle No</label>
                  <input type="text" value={form.vehicle_no} onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date Submitted</label>
                  <input type="date" value={form.date_submitted} onChange={e => setForm(f => ({ ...f, date_submitted: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Entry By</label>
                  <input type="text" value={form.entry_by} onChange={e => setForm(f => ({ ...f, entry_by: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Document Checklist</p>
                <div className="grid grid-cols-2 gap-2">
                  {BOOL_FIELDS.map(f => (
                    <label key={f} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form[f]}
                        onChange={e => setForm(prev => ({ ...prev, [f]: e.target.checked }))}
                        className="w-4 h-4 accent-blue-700"
                      />
                      <span className="text-sm text-gray-700">{docLabels[f]}</span>
                    </label>
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

      {/* Bulk Import Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-2">Bulk Import Vehicle Numbers</h2>
            <p className="text-sm text-gray-500 mb-4">Paste vehicle numbers separated by commas or new lines.</p>

            {/* Import Mode */}
            <div className="mb-4 rounded-lg border border-gray-200 overflow-hidden">
              <div
                onClick={() => setBulkMode('skip')}
                className={`flex items-start gap-3 p-3 cursor-pointer transition ${bulkMode === 'skip' ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50'}`}
              >
                <input type="radio" checked={bulkMode === 'skip'} onChange={() => setBulkMode('skip')} className="mt-1" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Smart Import (Skip Duplicates) ✅ Recommended</p>
                  <p className="text-xs text-gray-500">If 430 records exist, only imports from 431 onwards. Already existing vehicle numbers are skipped automatically.</p>
                </div>
              </div>
              <div
                onClick={() => setBulkMode('replace')}
                className={`flex items-start gap-3 p-3 cursor-pointer transition border-t ${bulkMode === 'replace' ? 'bg-red-50 border-l-4 border-red-500' : 'hover:bg-gray-50'}`}
              >
                <input type="radio" checked={bulkMode === 'replace'} onChange={() => setBulkMode('replace')} className="mt-1" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Replace All (Delete then Import) ⚠️ Destructive</p>
                  <p className="text-xs text-gray-500">Deletes ALL existing subsidy records first, then imports the new list fresh.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date Submitted</label>
                  <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Entry By</label>
                  <input type="text" value={bulkBy} onChange={e => setBulkBy(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Vehicle Numbers</label>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  rows={8}
                  placeholder="CG07AB1234, CG07CD5678&#10;CG07EF9012&#10;..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {bulkText.split(/[\n,]+/).filter(v => v.trim()).length} vehicle(s) detected
                </p>
              </div>
              {bulkLog && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
                  ℹ️ {bulkLog}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowBulk(false); setBulkLog(null) }} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition">Cancel</button>
              <button
                onClick={handleBulkImport}
                disabled={bulkSaving}
                className={`px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 ${bulkMode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-900 hover:bg-blue-800'}`}
              >
                {bulkSaving ? 'Importing...' : bulkMode === 'replace' ? '⚠️ Delete All & Import' : '✅ Smart Import'}
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
