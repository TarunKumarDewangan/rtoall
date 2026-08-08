'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase, EvFinalV1Row, fetchAllRows } from '@/lib/supabase'
import { exportToExcel } from '@/lib/excelImport'
import PinModal from '@/components/PinModal'

// Expects the first pasted line to be a tab-separated header row (exactly
// what Excel gives you when you copy a range including its header), and
// every following line to be a data row with the same column order. No
// fixed schema — whatever headers show up become that row's JSON keys, so
// this works for any wide export (vehicle registration, bank data, etc.)
// without needing a new table/page built for every different column set.
function parseTable(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = lines[0].split('\t').map((h, i) => h.trim() || `Column ${i + 1}`)
  const rows = lines.slice(1).map(line => {
    const cols = line.split('\t')
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (cols[i] ?? '').trim() })
    return obj
  })
  return { headers, rows }
}

// Union of every key seen across all saved rows, in first-seen order — a
// later paste with extra/different columns just extends the table instead
// of breaking it.
function computeColumns(rows: EvFinalV1Row[]): string[] {
  const seen = new Set<string>()
  const cols: string[] = []
  rows.forEach(r => {
    Object.keys(r.row_data || {}).forEach(k => {
      if (!seen.has(k)) { seen.add(k); cols.push(k) }
    })
  })
  return cols
}

const SAVE_CHUNK_SIZE = 300 // wide rows -> smaller chunks to stay under payload limits
const VISIBLE_COLS_STORAGE_KEY = 'ev_final_v1_visible_columns'

export default function EvFinalV1Page() {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [savedRows, setSavedRows] = useState<EvFinalV1Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchColumn, setSearchColumn] = useState('') // '' = search across every column
  const [filterColumn, setFilterColumn] = useState('') // '' = no column filter applied
  const [filterByYear, setFilterByYear] = useState(false) // group filterColumn's values by the 4-digit year found inside them (for date columns)
  const [filterValues, setFilterValues] = useState<string[]>([]) // multi-select: empty = no filter applied
  const [showFilterValuePicker, setShowFilterValuePicker] = useState(false)
  const [pageSize, setPageSize] = useState<number | 'all'>(50)
  const [page, setPage] = useState(1)

  const [dupColumn, setDupColumn] = useState('') // which column counts as the "identity" for duplicate detection
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [showRemoveDuplicatesConfirm, setShowRemoveDuplicatesConfirm] = useState(false)
  const [removingDuplicates, setRemovingDuplicates] = useState(false)

  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

  const [editRow, setEditRow] = useState<EvFinalV1Row | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [savingEdit, setSavingEdit] = useState(false)

  const [pinAction, setPinAction] = useState<null
    | { type: 'edit'; row: EvFinalV1Row }
    | { type: 'delete'; id: number }
    | { type: 'deleteAll' }
    | { type: 'removeDuplicates' }>(null)

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({})
  const [showColPicker, setShowColPicker] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(VISIBLE_COLS_STORAGE_KEY)
    if (saved) {
      try { setVisibleCols(JSON.parse(saved)) } catch {}
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(VISIBLE_COLS_STORAGE_KEY, JSON.stringify(visibleCols))
  }, [visibleCols])

  const parsed = useMemo(() => parseTable(input), [input])

  useEffect(() => { fetchSaved() }, [])

  async function fetchSaved() {
    setLoading(true)
    const { data, error } = await fetchAllRows<EvFinalV1Row>('ev_final_v1', 'created_at', false)
    if (error) showMsg('error', error.message)
    else setSavedRows(data || [])
    setLoading(false)
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  async function handleSave() {
    if (parsed.rows.length === 0) return
    setSaving(true)
    setSaveProgress({ done: 0, total: parsed.rows.length })

    const payload = parsed.rows.map(row_data => ({ row_data }))
    for (let i = 0; i < payload.length; i += SAVE_CHUNK_SIZE) {
      const chunk = payload.slice(i, i + SAVE_CHUNK_SIZE)
      const { error } = await supabase.from('ev_final_v1').insert(chunk)
      if (error) {
        setSaving(false)
        setSaveProgress(null)
        showMsg('error', error.message)
        return
      }
      setSaveProgress({ done: Math.min(i + SAVE_CHUNK_SIZE, payload.length), total: payload.length })
    }

    setSaving(false)
    setSaveProgress(null)
    showMsg('success', `${payload.length} पंक्तियाँ सेव हुईं।`)
    setInput('')
    fetchSaved()
  }

  const columns = useMemo(() => computeColumns(savedRows), [savedRows])

  // Reset the column filter whenever the chosen column changes, so a
  // stale value from a previous column never silently filters wrongly.
  useEffect(() => { setFilterValues([]); setFilterByYear(false) }, [filterColumn])

  function yearOf(value: string): string | null {
    const m = String(value || '').match(/\b(19|20)\d{2}\b/)
    return m ? m[0] : null
  }

  // Distinct values available to filter on for the currently chosen
  // column — either the raw values, or (when "साल के अनुसार" is on) just
  // the 4-digit years found inside them, e.g. for a Registration Date
  // column full of "2026-04-14 0.00.0" style values.
  const filterOptions = useMemo(() => {
    if (!filterColumn) return []
    const values = new Set<string>()
    savedRows.forEach(r => {
      const v = r.row_data?.[filterColumn]
      if (!v) return
      if (filterByYear) {
        const y = yearOf(v)
        if (y) values.add(y)
      } else {
        values.add(v)
      }
    })
    return [...values].sort()
  }, [savedRows, filterColumn, filterByYear])

  const columnLooksDateLike = useMemo(() => {
    if (!filterColumn) return false
    return savedRows.some(r => yearOf(r.row_data?.[filterColumn] || ''))
  }, [savedRows, filterColumn])

  // Counts how many rows share the same (non-empty) value in the chosen
  // "identity" column — since ev_final_v1 has no fixed schema, the user
  // picks which column actually identifies a unique record (e.g. Chassis
  // Number or Registration Number) rather than assuming one.
  const duplicateCounts = useMemo(() => {
    if (!dupColumn) return {}
    const counts: Record<string, number> = {}
    savedRows.forEach(r => {
      const v = r.row_data?.[dupColumn]
      if (!v) return
      counts[v] = (counts[v] || 0) + 1
    })
    return counts
  }, [savedRows, dupColumn])

  const duplicateValueCount = useMemo(
    () => Object.values(duplicateCounts).filter(c => c > 1).length,
    [duplicateCounts]
  )

  // For each duplicate value, keeps the earliest-saved row (lowest id)
  // and marks the rest for removal.
  const duplicateIdsToRemove = useMemo(() => {
    if (!dupColumn) return []
    const groups: Record<string, EvFinalV1Row[]> = {}
    savedRows.forEach(r => {
      const v = r.row_data?.[dupColumn]
      if (!v) return
      ;(groups[v] ||= []).push(r)
    })
    const ids: number[] = []
    Object.values(groups).forEach(group => {
      if (group.length < 2) return
      const sorted = [...group].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      sorted.slice(1).forEach(r => { if (r.id != null) ids.push(r.id) })
    })
    return ids
  }, [savedRows, dupColumn])

  useEffect(() => { setShowDuplicatesOnly(false) }, [dupColumn])

  const filtered = useMemo(() => {
    let rows = savedRows

    if (filterColumn && filterValues.length > 0) {
      const wanted = new Set(filterValues)
      rows = rows.filter(r => {
        const v = r.row_data?.[filterColumn] || ''
        return wanted.has(filterByYear ? (yearOf(v) || '') : v)
      })
    }

    if (dupColumn && showDuplicatesOnly) {
      rows = rows.filter(r => (duplicateCounts[r.row_data?.[dupColumn] || ''] || 0) > 1)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(r => {
        if (searchColumn) return String(r.row_data?.[searchColumn] || '').toLowerCase().includes(q)
        return Object.values(r.row_data || {}).some(v => String(v).toLowerCase().includes(q))
      })
    }

    return rows
  }, [savedRows, search, searchColumn, filterColumn, filterValues, filterByYear, dupColumn, showDuplicatesOnly, duplicateCounts])

  useEffect(() => { setPage(1) }, [search, searchColumn, filterColumn, filterValues, filterByYear, dupColumn, showDuplicatesOnly, pageSize])

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginated = useMemo(() => {
    if (pageSize === 'all') return filtered
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, pageSize, currentPage])

  function requestEdit(row: EvFinalV1Row) { setPinAction({ type: 'edit', row }) }
  function requestDelete(id: number) { setPinAction({ type: 'delete', id }) }
  function requestDeleteAll() { setPinAction({ type: 'deleteAll' }) }
  function requestRemoveDuplicates() { setPinAction({ type: 'removeDuplicates' }) }
  function onPinSuccess() {
    if (!pinAction) return
    if (pinAction.type === 'edit') openEdit(pinAction.row)
    else if (pinAction.type === 'delete') setDeleteId(pinAction.id)
    else if (pinAction.type === 'deleteAll') setShowDeleteAll(true)
    else if (pinAction.type === 'removeDuplicates') setShowRemoveDuplicatesConfirm(true)
    setPinAction(null)
  }

  function openEdit(row: EvFinalV1Row) {
    setEditRow(row)
    setEditForm({ ...row.row_data })
  }

  async function handleSaveEdit() {
    if (!editRow?.id) return
    setSavingEdit(true)
    const { error } = await supabase.from('ev_final_v1').update({ row_data: editForm }).eq('id', editRow.id)
    setSavingEdit(false)
    if (error) showMsg('error', error.message)
    else {
      showMsg('success', 'Updated.')
      setEditRow(null)
      fetchSaved()
    }
  }

  // Keeps the earliest-saved row per duplicate value in dupColumn and
  // deletes the rest, then re-fetches and verifies every distinct value
  // from before is still present — only the extra copies vanish.
  async function handleRemoveDuplicates() {
    if (!dupColumn || duplicateIdsToRemove.length === 0) { setShowRemoveDuplicatesConfirm(false); return }
    setRemovingDuplicates(true)

    const distinctBefore = new Set(savedRows.map(r => r.row_data?.[dupColumn]).filter(Boolean))
    const idsToRemove = new Set(duplicateIdsToRemove)

    const CHUNK = 300
    for (let i = 0; i < duplicateIdsToRemove.length; i += CHUNK) {
      const chunk = duplicateIdsToRemove.slice(i, i + CHUNK)
      const { error } = await supabase.from('ev_final_v1').delete().in('id', chunk)
      if (error) {
        setRemovingDuplicates(false)
        setShowRemoveDuplicatesConfirm(false)
        showMsg('error', error.message)
        fetchSaved()
        return
      }
    }

    const { data: freshData, error: refetchError } = await fetchAllRows<EvFinalV1Row>('ev_final_v1', 'created_at', false)
    setRemovingDuplicates(false)
    setShowRemoveDuplicatesConfirm(false)

    if (refetchError) {
      showMsg('error', `Deleted but could not verify: ${refetchError.message}`)
      fetchSaved()
      return
    }

    const after = freshData || []
    const distinctAfter = new Set(after.map(r => r.row_data?.[dupColumn]).filter(Boolean))
    const lostValues = [...distinctBefore].filter(v => !distinctAfter.has(v))
    const stillHasRemovedId = after.some(r => r.id != null && idsToRemove.has(r.id))

    setSavedRows(after)

    if (lostValues.length > 0 || stillHasRemovedId) {
      showMsg('error',
        stillHasRemovedId
          ? 'चेतावनी: कुछ duplicate रिकॉर्ड हटाए नहीं जा सके — दोबारा कोशिश करें।'
          : `चेतावनी: ${lostValues.length} मान पूरी तरह गायब हो गए (यह नहीं होना चाहिए था): ${lostValues.slice(0, 5).join(', ')}। कृपया तुरंत जाँच करें।`
      )
    } else {
      showMsg('success', `${duplicateIdsToRemove.length} duplicate रिकॉर्ड हटाए गए — सभी ${distinctBefore.size} मूल मान सुरक्षित हैं (सत्यापित)।`)
    }
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from('ev_final_v1').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Deleted.'); fetchSaved() }
  }

  async function handleDeleteAll() {
    setDeletingAll(true)
    const { error } = await supabase.from('ev_final_v1').delete().neq('id', 0)
    setDeletingAll(false)
    setShowDeleteAll(false)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'All records deleted.'); fetchSaved() }
  }

  function copyAll() {
    const visibleColumns = columns.filter(c => visibleCols[c] !== false)
    const text = [
      visibleColumns.join('\t'),
      ...filtered.map(r => visibleColumns.map(c => r.row_data?.[c] || '').join('\t')),
    ].join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleExportExcel() {
    const visibleColumns = columns.filter(c => visibleCols[c] !== false)
    const rows = filtered.map(r => visibleColumns.map(c => r.row_data?.[c] || ''))
    exportToExcel(`ev_final_v1_${new Date().toISOString().slice(0, 10)}.xlsx`, visibleColumns, rows)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-blue-900">EV Final V1</h1>
          <p className="text-sm text-gray-500 mt-0.5">पहली पंक्ति हेडर होनी चाहिए — Excel से पूरी टेबल (हेडर सहित) कॉपी-पेस्ट करें, कोई भी कॉलम-सेट चलेगा</p>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        {/* Paste + Preview */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <label className="block text-xs font-semibold text-gray-600 mb-1">यहाँ Excel डेटा पेस्ट करें (हेडर रो सहित)</label>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={8}
            placeholder="Chassis Number	Owner Name	Father Name	...  ← पहली पंक्ति हेडर होनी चाहिए"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <p className="text-xs text-gray-500">
              {parsed.headers.length > 0
                ? `${parsed.headers.length} कॉलम पहचाने गए, ${parsed.rows.length} पंक्ति(याँ) तैयार`
                : 'डेटा पेस्ट करने का इंतज़ार'}
            </p>
            <div className="flex gap-2">
              {input && (
                <button onClick={() => setInput('')} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs hover:bg-gray-50">
                  Clear
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={parsed.rows.length === 0 || saving}
                className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition disabled:opacity-40"
              >
                {saving ? `Saving... ${saveProgress ? `(${saveProgress.done}/${saveProgress.total})` : ''}` : '🗄️ Save to Database'}
              </button>
            </div>
          </div>

          {parsed.rows.length > 0 && (
            <div className="mt-4 overflow-x-auto border border-gray-200 rounded-lg" style={{ maxHeight: '260px' }}>
              <table className="text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    {parsed.headers.map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {parsed.headers.map(h => (
                        <td key={h} className="px-2 py-1.5 whitespace-nowrap border-b border-gray-100">{row[h] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 20 && (
                <p className="text-xs text-gray-400 px-2 py-1.5">... और {parsed.rows.length - 20} पंक्तियाँ (preview सिर्फ पहली 20 दिखाता है)</p>
              )}
            </div>
          )}
        </div>

        {/* Saved Data */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold text-blue-900">Saved Data</h2>
            <p className="text-xs text-gray-500">Total: {filtered.length} रिकॉर्ड</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={requestDeleteAll} className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition">
              🗑️ Delete All
            </button>
            <button onClick={copyAll} disabled={filtered.length === 0} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition disabled:opacity-40">
              {copied ? '✅ Copied!' : '📋 Copy All'}
            </button>
            <button onClick={handleExportExcel} disabled={filtered.length === 0} className="px-4 py-2 rounded-lg border border-green-300 text-green-700 text-sm font-medium hover:bg-green-50 transition disabled:opacity-40">
              📊 Export Excel
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
                        <button onClick={() => setVisibleCols(Object.fromEntries(columns.map(c => [c, true])))} className="text-xs text-blue-700 hover:underline">All</button>
                        <button onClick={() => setVisibleCols(Object.fromEntries(columns.map(c => [c, false])))} className="text-xs text-blue-700 hover:underline">None</button>
                      </div>
                    </div>
                    {columns.map(c => (
                      <label key={c} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={visibleCols[c] !== false}
                          onChange={e => setVisibleCols(prev => ({ ...prev, [c]: e.target.checked }))}
                          className="w-4 h-4 accent-blue-700"
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          <select
            value={searchColumn}
            onChange={e => setSearchColumn(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">सभी कॉलम में खोजें</option>
            {columns.map(c => <option key={c} value={c}>{c} में खोजें</option>)}
          </select>
          <input
            type="text"
            placeholder="खोजें..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px] focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {search && (
            <button onClick={() => setSearch('')} className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Reset</button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-gray-500">फ़िल्टर:</span>
          <select
            value={filterColumn}
            onChange={e => setFilterColumn(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">कोई फ़िल्टर नहीं</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {filterColumn && (
            <>
              {columnLooksDateLike && (
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                  <input type="checkbox" checked={filterByYear} onChange={e => setFilterByYear(e.target.checked)} className="w-3.5 h-3.5 accent-blue-700" />
                  साल के अनुसार (by year)
                </label>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowFilterValuePicker(v => !v)}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white hover:bg-gray-50 transition min-w-[180px] text-left"
                >
                  {filterValues.length === 0 ? '-- मान चुनें (multi) --' : `${filterValues.length} चुने गए`}
                </button>
                {showFilterValuePicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowFilterValuePicker(false)} />
                    <div className="absolute left-0 top-full mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-2">
                      <div className="flex justify-between items-center px-2 py-1 mb-1 border-b border-gray-100">
                        <span className="text-xs font-semibold text-gray-500">एक या अधिक मान चुनें</span>
                        <div className="flex gap-2">
                          <button onClick={() => setFilterValues(filterOptions)} className="text-xs text-blue-700 hover:underline">All</button>
                          <button onClick={() => setFilterValues([])} className="text-xs text-blue-700 hover:underline">None</button>
                        </div>
                      </div>
                      {filterOptions.map(v => (
                        <label key={v} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={filterValues.includes(v)}
                            onChange={e => setFilterValues(prev => e.target.checked ? [...prev, v] : prev.filter(x => x !== v))}
                            className="w-4 h-4 accent-blue-700"
                          />
                          {v}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => { setFilterColumn(''); setFilterValues([]) }} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs hover:bg-gray-50">Clear filter</button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-gray-500">Duplicate check कॉलम:</span>
          <select
            value={dupColumn}
            onChange={e => setDupColumn(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">-- कॉलम चुनें (जैसे Chassis Number / Registration Number) --</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {dupColumn && (
            <>
              <button
                onClick={() => setShowDuplicatesOnly(v => !v)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${showDuplicatesOnly ? 'bg-amber-600 border-amber-600 text-white hover:bg-amber-700' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}`}
              >
                🔁 Check Duplicate Values {duplicateValueCount > 0 && `(${duplicateValueCount})`}
              </button>
              <button
                onClick={requestRemoveDuplicates}
                disabled={duplicateIdsToRemove.length === 0}
                className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition disabled:opacity-40"
              >
                🧹 Remove Duplicate Values {duplicateIdsToRemove.length > 0 && `(${duplicateIdsToRemove.length})`}
              </button>
            </>
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
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-40">← Prev</button>
              <span className="text-xs text-gray-600">Page {currentPage} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-40">Next →</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : columns.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white border border-gray-200 rounded-xl">अभी तक कोई डेटा सेव नहीं हुआ</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="text-sm">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">#</th>
                  {columns.filter(c => visibleCols[c] !== false).map(c => (
                    <th key={c} className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">{c}</th>
                  ))}
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={columns.filter(c => visibleCols[c] !== false).length + 2} className="text-center py-10 text-gray-400">No records found</td></tr>
                ) : paginated.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-xs text-gray-500">{pageSize === 'all' ? i + 1 : (currentPage - 1) * pageSize + i + 1}</td>
                    {columns.filter(c => visibleCols[c] !== false).map(c => (
                      <td key={c} className="px-3 py-2 text-xs whitespace-nowrap max-w-[260px] truncate" title={r.row_data?.[c]}>
                        {r.row_data?.[c] || '—'}
                        {c === dupColumn && duplicateCounts[r.row_data?.[c] || ''] > 1 && (
                          <span className="ml-2 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 align-middle">
                            ×{duplicateCounts[r.row_data?.[c] || '']}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-xs">
                      <div className="flex gap-1">
                        <button onClick={() => requestEdit(r)} className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium">Edit</button>
                        <button onClick={() => requestDelete(r.id!)} className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-40">← Prev</button>
            <span className="text-xs text-gray-600">Page {currentPage} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>

      {/* PIN Modal */}
      {pinAction && (
        <PinModal
          action={
            pinAction.type === 'edit' ? 'edit this record'
              : pinAction.type === 'delete' ? 'delete this record'
              : pinAction.type === 'deleteAll' ? 'delete ALL records'
              : 'remove duplicate records'
          }
          onSuccess={onPinSuccess}
          onCancel={() => setPinAction(null)}
        />
      )}

      {/* Edit Form Modal */}
      {editRow && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-5">Edit Record</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
              {columns.map(c => (
                <div key={c}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{c}</label>
                  <input
                    type="text"
                    value={editForm[c] || ''}
                    onChange={e => setEditForm(f => ({ ...f, [c]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditRow(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleSaveEdit} disabled={savingEdit} className="px-5 py-2 rounded-lg bg-blue-900 text-white text-sm font-semibold hover:bg-blue-800 transition disabled:opacity-60">
                {savingEdit ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Confirm */}
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

      {/* Delete ALL Confirm */}
      {showDeleteAll && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border-2 border-red-500">
            <h3 className="text-xl font-bold text-red-700 mb-2">⚠️ Delete ALL Records?</h3>
            <p className="text-sm text-gray-700 mb-1">This will permanently delete <strong>all {savedRows.length} records</strong>.</p>
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
              &quot;{dupColumn}&quot; के आधार पर हर मान की सबसे पहली एंट्री रखी जाएगी, बाकी <strong>{duplicateIdsToRemove.length} duplicate रिकॉर्ड</strong> हटा दिए जाएंगे।
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
