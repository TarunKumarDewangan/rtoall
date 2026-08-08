'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { exportToExcel } from '@/lib/excelImport'

// Whole-token capture, on purpose: any whitespace-separated token that
// starts with "CG" + a 2-digit district code is taken in full, exactly as
// typed — including malformed/non-standard ones like "CG05/TC/153" or a
// bare "CG05". Earlier versions tried to parse out clean district/series/
// number sub-parts, which silently dropped anything that didn't fit the
// expected shape and (worse) let a match reach across a line break and
// fabricate values that don't exist in the source data at all. Only
// trailing punctuation (commas etc. from list-style pasting) is trimmed.
const TOKEN_START_RE = /^CG[-]?\d{2}/i

function extractVehicleNumbers(text: string): string[] {
  const tokens = text.split(/\s+/).filter(Boolean)
  const found: string[] = []
  for (const token of tokens) {
    const trimmed = token.replace(/^[,;)]+|[,;)]+$/g, '')
    if (TOKEN_START_RE.test(trimmed)) {
      found.push(trimmed.toUpperCase())
    }
  }
  return found
}

const SAVE_CHUNK_SIZE = 500

export default function SubsidyExtractorPage() {
  const [input, setInput] = useState('')
  const [sortAsc, setSortAsc] = useState(false)
  const [copied, setCopied] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null)
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Duplicates are kept intentionally — a repeated vehicle number in the
  // source data is meaningful information, not noise to be collapsed away.
  const vehicleNumbers = useMemo(() => {
    let list = extractVehicleNumbers(input)
    if (sortAsc) list = [...list].sort((a, b) => a.localeCompare(b))
    return list
  }, [input, sortAsc])

  function copyAll() {
    navigator.clipboard.writeText(vehicleNumbers.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadTxt() {
    const blob = new Blob([vehicleNumbers.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vehicle_numbers_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportExcel() {
    exportToExcel(`vehicle_numbers_${new Date().toISOString().slice(0, 10)}.xlsx`, ['Vehicle No'], vehicleNumbers.map(v => [v]))
  }

  // Saves exactly what's on screen, duplicates included — no dedup, no
  // conflict handling, since repeated vehicle numbers are allowed to
  // accumulate as separate rows.
  async function saveToDatabase() {
    if (vehicleNumbers.length === 0) return
    setSaving(true)
    setSaveResult(null)
    setSaveProgress({ done: 0, total: vehicleNumbers.length })

    const rows = vehicleNumbers.map(v => ({ vehicle_no: v }))
    for (let i = 0; i < rows.length; i += SAVE_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + SAVE_CHUNK_SIZE)
      const { error } = await supabase.from('ev_extracted_data').insert(chunk)
      if (error) {
        setSaving(false)
        setSaveProgress(null)
        setSaveResult({ type: 'error', text: error.message })
        return
      }
      setSaveProgress({ done: Math.min(i + SAVE_CHUNK_SIZE, rows.length), total: rows.length })
    }

    setSaving(false)
    setSaveProgress(null)
    setSaveResult({ type: 'success', text: `${rows.length} वाहन नंबर सेव हुए (duplicates सहित)।` })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">EV Subsidy Extractor</h1>
            <p className="text-sm text-gray-500 mt-0.5">कोई भी डेटा पेस्ट करें — CG05 से शुरू होने वाला हर टोकन पूरा-का-पूरा निकाला जाएगा (गलत/अधूरे भी)</p>
          </div>
          <Link href="/subsidy-extracted-data" className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition">
            📂 View Saved Data
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">यहाँ कोई भी डेटा पेस्ट करें</label>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              rows={20}
              placeholder="Excel, WhatsApp, PDF — कहीं से भी कॉपी-पेस्ट करें। सिर्फ CG05... जैसे वाहन नंबर पहचाने और निकाले जाएंगे।"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {input && (
              <button onClick={() => setInput('')} className="mt-2 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs hover:bg-gray-50">
                Clear
              </button>
            )}
          </div>

          {/* Output */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-600">वाहन नंबर ({vehicleNumbers.length})</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                  <input type="checkbox" checked={sortAsc} onChange={e => setSortAsc(e.target.checked)} className="w-3.5 h-3.5 accent-blue-700" />
                  Sort A-Z
                </label>
              </div>
            </div>
            <div className="border border-gray-300 rounded-lg bg-white overflow-y-auto" style={{ height: '460px' }}>
              {vehicleNumbers.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-400 px-4 text-center">
                  डेटा पेस्ट करने पर वाहन नंबर यहाँ दिखेंगे
                </div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {vehicleNumbers.map((v, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-1.5 text-xs text-gray-400 w-10">{i + 1}</td>
                        <td className="px-3 py-1.5 text-sm font-mono font-semibold text-blue-900">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={copyAll}
                disabled={vehicleNumbers.length === 0}
                className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition disabled:opacity-40"
              >
                {copied ? '✅ Copied!' : '📋 Copy All'}
              </button>
              <button
                onClick={downloadTxt}
                disabled={vehicleNumbers.length === 0}
                className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition disabled:opacity-40"
              >
                💾 Download .txt
              </button>
              <button
                onClick={handleExportExcel}
                disabled={vehicleNumbers.length === 0}
                className="px-4 py-2 rounded-lg border border-green-300 text-green-700 text-sm font-medium hover:bg-green-50 transition disabled:opacity-40"
              >
                📊 Export Excel
              </button>
              <button
                onClick={saveToDatabase}
                disabled={vehicleNumbers.length === 0 || saving}
                className="px-4 py-2 rounded-lg border border-green-300 text-green-700 text-sm font-medium hover:bg-green-50 transition disabled:opacity-40"
              >
                {saving
                  ? `Saving... ${saveProgress ? `(${saveProgress.done}/${saveProgress.total})` : ''}`
                  : '🗄️ Save to Database'}
              </button>
            </div>
            {saveResult && (
              <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium ${saveResult.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {saveResult.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
