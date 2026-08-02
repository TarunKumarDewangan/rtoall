'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase, EvExtractedData, fetchAllRows } from '@/lib/supabase'
import PinModal from '@/components/PinModal'

export default function SubsidyExtractedDataPage() {
  const [entries, setEntries] = useState<EvExtractedData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [newVehicleNo, setNewVehicleNo] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [showCG05Only, setShowCG05Only] = useState(false)
  const [pageSize, setPageSize] = useState<number | 'all'>(50)
  const [page, setPage] = useState(1)

  const [showRemoveDuplicatesConfirm, setShowRemoveDuplicatesConfirm] = useState(false)
  const [removingDuplicates, setRemovingDuplicates] = useState(false)

  const [pinAction, setPinAction] = useState<null
    | { type: 'delete'; id: number }
    | { type: 'deleteAll' }
    | { type: 'removeDuplicates' }>(null)

  useEffect(() => { fetchEntries() }, [])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await fetchAllRows<EvExtractedData>('ev_extracted_data', 'vehicle_no', true)
    if (error) showMsg('error', error.message)
    else setEntries(data || [])
    setLoading(false)
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  // Counts how many times each vehicle number appears (duplicates are
  // allowed to accumulate in this table on purpose).
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
    const groups: Record<string, EvExtractedData[]> = {}
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
    let rows = entries
    if (showDuplicatesOnly) rows = rows.filter(e => duplicateCounts[e.vehicle_no] > 1)
    if (showCG05Only) rows = rows.filter(e => e.vehicle_no.toUpperCase().startsWith('CG05'))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(e => e.vehicle_no.toLowerCase().includes(q))
    }
    return rows
  }, [entries, search, showDuplicatesOnly, showCG05Only, duplicateCounts])

  // Jump back to page 1 whenever the filtered set or page size changes,
  // so you don't land on an empty out-of-range page.
  useEffect(() => { setPage(1) }, [search, showDuplicatesOnly, showCG05Only, pageSize])

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginated = useMemo(() => {
    if (pageSize === 'all') return filtered
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, pageSize, currentPage])

  function requestDelete(id: number) { setPinAction({ type: 'delete', id }) }
  function requestDeleteAll() { setPinAction({ type: 'deleteAll' }) }
  function requestRemoveDuplicates() { setPinAction({ type: 'removeDuplicates' }) }
  function onPinSuccess() {
    if (!pinAction) return
    if (pinAction.type === 'delete') setDeleteId(pinAction.id)
    else if (pinAction.type === 'deleteAll') setShowDeleteAll(true)
    else if (pinAction.type === 'removeDuplicates') setShowRemoveDuplicatesConfirm(true)
    setPinAction(null)
  }

  async function handleAdd() {
    const vehicle_no = newVehicleNo.trim().toUpperCase()
    if (!vehicle_no) return
    setAdding(true)
    const { error } = await supabase.from('ev_extracted_data').insert({ vehicle_no })
    setAdding(false)
    if (error) showMsg('error', error.message)
    else {
      showMsg('success', 'Added!')
      setNewVehicleNo('')
      fetchEntries()
    }
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from('ev_extracted_data').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Deleted.'); fetchEntries() }
  }

  async function handleDeleteAll() {
    setDeletingAll(true)
    const { error } = await supabase.from('ev_extracted_data').delete().neq('id', 0)
    setDeletingAll(false)
    setShowDeleteAll(false)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'All records deleted.'); fetchEntries() }
  }

  // Keeps the earliest-saved copy of each vehicle number and deletes the
  // rest, in chunks so a large duplicate set doesn't hit a payload limit.
  async function handleRemoveDuplicates() {
    if (duplicateIdsToRemove.length === 0) { setShowRemoveDuplicatesConfirm(false); return }
    setRemovingDuplicates(true)
    const CHUNK = 500
    for (let i = 0; i < duplicateIdsToRemove.length; i += CHUNK) {
      const chunk = duplicateIdsToRemove.slice(i, i + CHUNK)
      const { error } = await supabase.from('ev_extracted_data').delete().in('id', chunk)
      if (error) {
        setRemovingDuplicates(false)
        setShowRemoveDuplicatesConfirm(false)
        showMsg('error', error.message)
        return
      }
    }
    setRemovingDuplicates(false)
    setShowRemoveDuplicatesConfirm(false)
    showMsg('success', `${duplicateIdsToRemove.length} duplicate रिकॉर्ड हटाए गए।`)
    fetchEntries()
  }

  function copyAll() {
    navigator.clipboard.writeText(filtered.map(e => e.vehicle_no).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadTxt() {
    const blob = new Blob([filtered.map(e => e.vehicle_no).join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ev_extracted_data_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">EV Extracted Data</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} vehicle numbers (permanently saved)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/subsidy-extractor" className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              ← Extractor
            </Link>
            <button onClick={requestDeleteAll} className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition">
              🗑️ Delete All
            </button>
            <button onClick={copyAll} disabled={filtered.length === 0} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition disabled:opacity-40">
              {copied ? '✅ Copied!' : '📋 Copy All'}
            </button>
            <button onClick={downloadTxt} disabled={filtered.length === 0} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition disabled:opacity-40">
              💾 Download .txt
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
            <button
              onClick={() => setShowCG05Only(v => !v)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${showCG05Only ? 'bg-blue-700 border-blue-700 text-white hover:bg-blue-800' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}`}
            >
              🎯 सिर्फ CG05
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            placeholder="Search vehicle no..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px] focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <input
            type="text"
            placeholder="CG05..."
            value={newVehicleNo}
            onChange={e => setNewVehicleNo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40 font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button onClick={handleAdd} disabled={adding || !newVehicleNo.trim()} className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition disabled:opacity-40">
            + Add
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">हर पेज में दिखाएँ:</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {[50, 100, 200, 300, 400, 500, 1000, 5000, 10000].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value="all">Full View (सभी)</option>
            </select>
          </div>
          {pageSize !== 'all' && totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-600">Page {currentPage} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-blue-900 text-white">
                  {['#', 'Vehicle No', 'Saved On', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-10 text-gray-400">No entries found</td></tr>
                ) : paginated.map((entry, i) => (
                  <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-xs text-gray-500">{pageSize === 'all' ? i + 1 : (currentPage - 1) * pageSize + i + 1}</td>
                    <td className="px-3 py-2 text-sm font-mono font-semibold text-blue-900 whitespace-nowrap">
                      {entry.vehicle_no}
                      {duplicateCounts[entry.vehicle_no] > 1 && (
                        <span className="ml-2 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 align-middle">
                          ×{duplicateCounts[entry.vehicle_no]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.created_at ? new Date(entry.created_at).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      <button onClick={() => requestDelete(entry.id!)} className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-600">Page {currentPage} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* PIN Modal */}
      {pinAction && (
        <PinModal
          action={
            pinAction.type === 'delete' ? 'delete this entry'
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
            <p className="text-sm text-gray-700 mb-1">This will permanently delete <strong>all {entries.length} vehicle numbers</strong>.</p>
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
