'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchAllColumnValues, fetchAllRows } from '@/lib/supabase'

type TableOption = { id: string; label: string; kind: 'fixed' | 'dynamic' }

// Every table in the system that holds vehicle numbers, either as a fixed
// "vehicle_no" column or (for the generic wide-paste tables) somewhere
// inside a dynamic row_data JSONB blob whose column name the user picks.
const TABLE_OPTIONS: TableOption[] = [
  { id: 'backlog_entries', label: 'Backlog Entries', kind: 'fixed' },
  { id: 'backlog_received', label: 'Backlog Received (File IN/Out)', kind: 'fixed' },
  { id: 'ghosnapatra_entries', label: 'घोषणापत्र (Ghoshnapatra)', kind: 'fixed' },
  { id: 'subsidy_entries', label: 'Received Application (Subsidy)', kind: 'fixed' },
  { id: 'subsidy_status', label: 'EV Subsidy Status', kind: 'fixed' },
  { id: 'modify_status', label: 'Modify Status', kind: 'fixed' },
  { id: 'work_done_registry', label: 'Work Done Registry', kind: 'fixed' },
  { id: 'ev_extracted_data', label: 'EV Extracted Data', kind: 'fixed' },
  { id: 'ev_excel_status_data', label: 'EV Excel Status Data', kind: 'fixed' },
  { id: 'ev_final_v1', label: 'EV Final V1', kind: 'dynamic' },
  { id: 'cgtrans_2022_pending', label: 'CGTrans 2022 Pending', kind: 'dynamic' },
]

function normalizeVN(v: string): string {
  return (v || '').trim().toUpperCase()
}

function computeColumns(rows: Record<string, string>[]): string[] {
  const seen = new Set<string>()
  const cols: string[] = []
  rows.forEach(r => {
    Object.keys(r || {}).forEach(k => { if (!seen.has(k)) { seen.add(k); cols.push(k) } })
  })
  return cols
}

type Side = 'A' | 'B'

export default function CompareVehiclesPage() {
  const [tableA, setTableA] = useState('')
  const [tableB, setTableB] = useState('')
  const [columnA, setColumnA] = useState('')
  const [columnB, setColumnB] = useState('')

  const [dynamicColumnsA, setDynamicColumnsA] = useState<string[]>([])
  const [dynamicColumnsB, setDynamicColumnsB] = useState<string[]>([])
  const [dynamicRowsA, setDynamicRowsA] = useState<Record<string, string>[]>([])
  const [dynamicRowsB, setDynamicRowsB] = useState<Record<string, string>[]>([])
  const [loadingDynamic, setLoadingDynamic] = useState<{ A: boolean; B: boolean }>({ A: false, B: false })

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [comparing, setComparing] = useState(false)
  const [compared, setCompared] = useState(false)
  const [totalA, setTotalA] = useState(0)
  const [totalB, setTotalB] = useState(0)
  const [matching, setMatching] = useState<string[]>([])
  const [onlyA, setOnlyA] = useState<string[]>([])
  const [onlyB, setOnlyB] = useState<string[]>([])

  const [searchMatch, setSearchMatch] = useState('')
  const [searchA, setSearchA] = useState('')
  const [searchB, setSearchB] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const optionA = TABLE_OPTIONS.find(t => t.id === tableA) || null
  const optionB = TABLE_OPTIONS.find(t => t.id === tableB) || null

  // Whenever a dynamic table is picked on either side, fetch its rows up
  // front just to compute the column list for the "which column is the
  // vehicle number" picker — the same fetch gets reused at Compare time.
  useEffect(() => { loadDynamic('A', tableA) }, [tableA])
  useEffect(() => { loadDynamic('B', tableB) }, [tableB])

  async function loadDynamic(side: Side, tableId: string) {
    const opt = TABLE_OPTIONS.find(t => t.id === tableId)
    if (side === 'A') setColumnA('')
    else setColumnB('')
    if (!opt || opt.kind !== 'dynamic') return

    setLoadingDynamic(s => ({ ...s, [side]: true }))
    const { data, error } = await fetchAllRows<{ row_data: Record<string, string> }>(tableId, 'created_at', false)
    setLoadingDynamic(s => ({ ...s, [side]: false }))
    if (error) { showMsg('error', error.message); return }
    const rows = (data || []).map(r => r.row_data || {})
    const cols = computeColumns(rows)
    if (side === 'A') { setDynamicRowsA(rows); setDynamicColumnsA(cols) }
    else { setDynamicRowsB(rows); setDynamicColumnsB(cols) }
  }

  const canCompare =
    !!tableA && !!tableB && tableA !== tableB &&
    (optionA?.kind === 'fixed' || !!columnA) &&
    (optionB?.kind === 'fixed' || !!columnB)

  async function getNumberSet(side: Side): Promise<Set<string>> {
    const tableId = side === 'A' ? tableA : tableB
    const column = side === 'A' ? columnA : columnB
    const opt = TABLE_OPTIONS.find(t => t.id === tableId)!
    if (opt.kind === 'fixed') {
      const values = await fetchAllColumnValues(tableId, 'vehicle_no')
      return new Set(values.map(normalizeVN).filter(Boolean))
    }
    const rows = side === 'A' ? dynamicRowsA : dynamicRowsB
    return new Set(rows.map(r => normalizeVN(r[column] || '')).filter(Boolean))
  }

  async function handleCompare() {
    if (!canCompare) return
    setComparing(true)
    setCompared(false)
    try {
      const [setA, setB] = await Promise.all([getNumberSet('A'), getNumberSet('B')])
      setTotalA(setA.size)
      setTotalB(setB.size)

      const matchArr: string[] = []
      const onlyAArr: string[] = []
      setA.forEach(v => { if (setB.has(v)) matchArr.push(v); else onlyAArr.push(v) })
      const onlyBArr: string[] = []
      setB.forEach(v => { if (!setA.has(v)) onlyBArr.push(v) })

      setMatching(matchArr.sort())
      setOnlyA(onlyAArr.sort())
      setOnlyB(onlyBArr.sort())
      setCompared(true)
    } catch (e: any) {
      showMsg('error', e?.message || 'Compare failed')
    }
    setComparing(false)
  }

  const filteredMatch = useMemo(() => {
    if (!searchMatch.trim()) return matching
    const q = searchMatch.trim().toUpperCase()
    return matching.filter(v => v.includes(q))
  }, [matching, searchMatch])

  const filteredOnlyA = useMemo(() => {
    if (!searchA.trim()) return onlyA
    const q = searchA.trim().toUpperCase()
    return onlyA.filter(v => v.includes(q))
  }, [onlyA, searchA])

  const filteredOnlyB = useMemo(() => {
    if (!searchB.trim()) return onlyB
    const q = searchB.trim().toUpperCase()
    return onlyB.filter(v => v.includes(q))
  }, [onlyB, searchB])

  function copyList(key: string, list: string[]) {
    navigator.clipboard.writeText(list.join('\n'))
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  function downloadList(filename: string, list: string[]) {
    const blob = new Blob([list.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function ResultSection({
    title, subtitle, colorClass, list, search, setSearch, downloadName,
  }: {
    title: string
    subtitle: string
    colorClass: string
    list: string[]
    search: string
    setSearch: (v: string) => void
    downloadName: string
  }) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <h3 className={`text-sm font-bold ${colorClass}`}>{title} ({list.length})</h3>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => copyList(title, list)} disabled={list.length === 0} className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 text-xs font-medium hover:bg-blue-50 transition disabled:opacity-40">
              {copiedKey === title ? '✅ Copied!' : '📋 Copy'}
            </button>
            <button onClick={() => downloadList(downloadName, list)} disabled={list.length === 0} className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 text-xs font-medium hover:bg-blue-50 transition disabled:opacity-40">
              💾 .txt
            </button>
          </div>
        </div>
        <input
          type="text"
          placeholder="इस लिस्ट में खोजें..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg">
          {list.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-6">कोई रिकॉर्ड नहीं</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {list.map((v, i) => (
                  <tr key={v} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-1.5 text-gray-400 w-10">{i + 1}</td>
                    <td className="px-3 py-1.5 font-mono font-semibold text-gray-800">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-blue-900">Compare Vehicle Numbers</h1>
          <p className="text-sm text-gray-500 mt-0.5">कोई भी दो टेबल चुनें — मिलते-जुलते और न मिलने वाले वाहन नंबर दोनों तरफ से दिखेंगे</p>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Table A</label>
              <select
                value={tableA}
                onChange={e => setTableA(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">-- टेबल चुनें --</option>
                {TABLE_OPTIONS.map(t => <option key={t.id} value={t.id} disabled={t.id === tableB}>{t.label}</option>)}
              </select>
              {optionA?.kind === 'dynamic' && (
                <div className="mt-2">
                  {loadingDynamic.A ? (
                    <p className="text-xs text-gray-400">कॉलम लोड हो रहे हैं...</p>
                  ) : (
                    <select
                      value={columnA}
                      onChange={e => setColumnA(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      <option value="">-- वाहन नंबर वाला कॉलम चुनें --</option>
                      {dynamicColumnsA.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Table B</label>
              <select
                value={tableB}
                onChange={e => setTableB(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">-- टेबल चुनें --</option>
                {TABLE_OPTIONS.map(t => <option key={t.id} value={t.id} disabled={t.id === tableA}>{t.label}</option>)}
              </select>
              {optionB?.kind === 'dynamic' && (
                <div className="mt-2">
                  {loadingDynamic.B ? (
                    <p className="text-xs text-gray-400">कॉलम लोड हो रहे हैं...</p>
                  ) : (
                    <select
                      value={columnB}
                      onChange={e => setColumnB(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      <option value="">-- वाहन नंबर वाला कॉलम चुनें --</option>
                      {dynamicColumnsB.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCompare}
              disabled={!canCompare || comparing}
              className="px-5 py-2 rounded-lg bg-blue-900 text-white text-sm font-semibold hover:bg-blue-800 transition disabled:opacity-40"
            >
              {comparing ? 'Comparing...' : '🔍 Compare'}
            </button>
          </div>
        </div>

        {compared && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
                <div className="text-xl font-bold text-blue-900">{totalA}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{optionA?.label} — कुल अद्वितीय वाहन नंबर</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
                <div className="text-xl font-bold text-blue-900">{totalB}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{optionB?.label} — कुल अद्वितीय वाहन नंबर</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
                <div className="text-xl font-bold text-green-700">{matching.length}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">दोनों में मिलते हुए (Matching)</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ResultSection
                title="✅ Matching (दोनों में)"
                subtitle={`${optionA?.label} और ${optionB?.label} दोनों में मौजूद`}
                colorClass="text-green-700"
                list={filteredMatch}
                search={searchMatch}
                setSearch={setSearchMatch}
                downloadName="matching_vehicle_numbers.txt"
              />
              <ResultSection
                title={`🅰️ केवल ${optionA?.label}`}
                subtitle={`${optionB?.label} में नहीं मिले`}
                colorClass="text-amber-700"
                list={filteredOnlyA}
                search={searchA}
                setSearch={setSearchA}
                downloadName="only_in_table_a.txt"
              />
              <ResultSection
                title={`🅱️ केवल ${optionB?.label}`}
                subtitle={`${optionA?.label} में नहीं मिले`}
                colorClass="text-amber-700"
                list={filteredOnlyB}
                search={searchB}
                setSearch={setSearchB}
                downloadName="only_in_table_b.txt"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
