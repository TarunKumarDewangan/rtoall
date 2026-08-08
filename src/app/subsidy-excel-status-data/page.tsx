'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase, EvExcelStatusData, fetchAllRows } from '@/lib/supabase'
import { exportToExcel } from '@/lib/excelImport'
import PinModal from '@/components/PinModal'

const COLUMNS = [
  { id: 'vehicle_no', label: 'Vehicle No' },
  { id: 'batch_name', label: 'Name' },
  { id: 'created_at', label: 'Saved On' },
]
const VISIBLE_COLS_STORAGE_KEY = 'ev_excel_status_visible_columns'

export default function SubsidyExcelStatusDataPage() {
  const [entries, setEntries] = useState<EvExcelStatusData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showCG05Only, setShowCG05Only] = useState(true)
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [pageSize, setPageSize] = useState<number | 'all'>(50)
  const [page, setPage] = useState(1)

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
    | { type: 'delete'; id: number }
    | { type: 'deleteAll' }
    | { type: 'removeDuplicates' }>(null)

  useEffect(() => { fetchEntries() }, [])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await fetchAllRows<EvExcelStatusData>('ev_excel_status_data', 'created_at', false)
    if (error) showMsg('error', error.message)
    else setEntries(data || [])
    setLoading(false)
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  const nameList = useMemo(() => [...new Set(entries.map(e => e.batch_name).filter(Boolean))].sort(), [entries])

  // Counts how many times each vehicle number appears across all saved data
  // (duplicates are allowed to accumulate in this table on purpose).
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
    const groups: Record<string, EvExcelStatusData[]> = {}
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
    if (nameFilter) rows = rows.filter(e => e.batch_name === nameFilter)
    if (showDuplicatesOnly) rows = rows.filter(e => duplicateCounts[e.vehicle_no] > 1)
    if (showCG05Only) rows = rows.filter(e => e.vehicle_no.toUpperCase().startsWith('CG05'))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(e => e.vehicle_no.toLowerCase().includes(q) || e.batch_name.toLowerCase().includes(q))
    }
    return rows
  }, [entries, search, nameFilter, showCG05Only, showDuplicatesOnly, duplicateCounts])

  useEffect(() => { setPage(1) }, [search, nameFilter, showCG05Only, showDuplicatesOnly, pageSize])

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

  async function handleDelete(id: number) {
    const { error } = await supabase.from('ev_excel_status_data').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Deleted.'); fetchEntries() }
  }

  async function handleDeleteAll() {
    setDeletingAll(true)
    let query = supabase.from('ev_excel_status_data').delete()
    query = nameFilter ? query.eq('batch_name', nameFilter) : query.neq('id', 0)
    const { error } = await query
    setDeletingAll(false)
    setShowDeleteAll(false)
    if (error) showMsg('error', error.message)
    else { showMsg('success', nameFilter ? `"${nameFilter}" के सभी रिकॉर्ड हटाए गए।` : 'All records deleted.'); fetchEntries() }
  }

  // Keeps the earliest-saved copy of each vehicle number and deletes the
  // rest, in chunks, then re-fetches and verifies every distinct vehicle
  // number from before is still present — only the extra copies vanish.
  async function handleRemoveDuplicates() {
    if (duplicateIdsToRemove.length === 0) { setShowRemoveDuplicatesConfirm(false); return }
    setRemovingDuplicates(true)

    const distinctBefore = new Set(entries.map(e => e.vehicle_no))
    const idsToRemove = new Set(duplicateIdsToRemove)

    const CHUNK = 500
    for (let i = 0; i < duplicateIdsToRemove.length; i += CHUNK) {
      const chunk = duplicateIdsToRemove.slice(i, i + CHUNK)
      const { error } = await supabase.from('ev_excel_status_data').delete().in('id', chunk)
      if (error) {
        setRemovingDuplicates(false)
        setShowRemoveDuplicatesConfirm(false)
        showMsg('error', error.message)
        fetchEntries()
        return
      }
    }

    const { data: freshData, error: refetchError } = await fetchAllRows<EvExcelStatusData>('ev_excel_status_data', 'created_at', false)
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
    navigator.clipboard.writeText(filtered.map(e => e.vehicle_no).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadTxt() {
    const blob = new Blob([filtered.map(e => e.vehicle_no).join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ev_excel_status_${(nameFilter || 'all')}_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportExcel() {
    const visible = COLUMNS.filter(c => visibleCols[c.id] !== false)
    const headers = visible.map(c => c.label)
    const rows = filtered.map(e => visible.map(c => c.id === 'created_at' ? (e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN') : '') : (e as any)[c.id] || ''))
    exportToExcel(`ev_excel_status_${(nameFilter || 'all')}_${new Date().toISOString().slice(0, 10)}.xlsx`, headers, rows)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">EV Excel Status Data</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} vehicle numbers (permanently saved)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/subsidy-excel-status" className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
              ← Extractor
            </Link>
            <button onClick={requestDeleteAll} className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition">
              🗑️ {nameFilter ? `Delete "${nameFilter}"` : 'Delete All'}
            </button>
            <button onClick={copyAll} disabled={filtered.length === 0} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition disabled:opacity-40">
              {copied ? '✅ Copied!' : '📋 Copy All'}
            </button>
            <button onClick={downloadTxt} disabled={filtered.length === 0} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition disabled:opacity-40">
              💾 Download .txt
            </button>
            <button onClick={handleExportExcel} disabled={filtered.length === 0} className="px-4 py-2 rounded-lg border border-green-300 text-green-700 text-sm font-medium hover:bg-green-50 transition disabled:opacity-40">
              📊 Export Excel
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
              {showCG05Only ? '🎯 सिर्फ CG05 (डिफ़ॉल्ट)' : '🌐 सभी वाहन (Full Numbers)'}
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
            placeholder="Search vehicle no or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px] focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <select
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">सभी नाम (All Names)</option>
            {nameList.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {(search || nameFilter) && (
            <button onClick={() => { setSearch(''); setNameFilter('') }} className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Reset</button>
          )}
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
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">#</th>
                  {COLUMNS.filter(c => visibleCols[c.id] !== false).map(col => (
                    <th key={col.id} className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">{col.label}</th>
                  ))}
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={COLUMNS.filter(c => visibleCols[c.id] !== false).length + 2} className="text-center py-10 text-gray-400">No entries found</td></tr>
                ) : paginated.map((entry, i) => (
                  <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-xs text-gray-500">{pageSize === 'all' ? i + 1 : (currentPage - 1) * pageSize + i + 1}</td>
                    {visibleCols.vehicle_no !== false && (
                      <td className="px-3 py-2 text-sm font-mono font-semibold text-blue-900 whitespace-nowrap">
                        {entry.vehicle_no}
                        {duplicateCounts[entry.vehicle_no] > 1 && (
                          <span className="ml-2 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 align-middle">
                            ×{duplicateCounts[entry.vehicle_no]}
                          </span>
                        )}
                      </td>
                    )}
                    {visibleCols.batch_name !== false && (
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">{entry.batch_name}</span>
                      </td>
                    )}
                    {visibleCols.created_at !== false && (
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.created_at ? new Date(entry.created_at).toLocaleDateString('en-IN') : '—'}</td>
                    )}
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
              : pinAction.type === 'deleteAll' ? 'delete these records'
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

      {/* Delete ALL / Delete-by-name Confirm */}
      {showDeleteAll && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border-2 border-red-500">
            <h3 className="text-xl font-bold text-red-700 mb-2">⚠️ {nameFilter ? `Delete "${nameFilter}"?` : 'Delete ALL Records?'}</h3>
            <p className="text-sm text-gray-700 mb-1">
              {nameFilter
                ? <>This will permanently delete <strong>all records named &quot;{nameFilter}&quot;</strong>.</>
                : <>This will permanently delete <strong>all {entries.length} vehicle numbers</strong>.</>}
            </p>
            <p className="text-sm text-red-600 font-semibold mb-5">This action cannot be undone!</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteAll(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeleteAll} disabled={deletingAll} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-60">
                {deletingAll ? 'Deleting...' : 'Yes, Delete'}
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
