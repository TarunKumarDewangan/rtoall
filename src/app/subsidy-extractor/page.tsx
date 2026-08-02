'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Matches Chhattisgarh vehicle numbers in any common spacing/punctuation
// style people paste from Excel/WhatsApp/PDFs: "CG05AQ6874", "CG 05 AQ 6874",
// "CG-05-AQ-6874", lowercase, etc. Captures district code, letter series,
// and the numeric part separately so they can be rejoined cleanly.
// The gaps use [ \t] (space/tab only), NEVER \s — \s also matches newlines,
// which let an incomplete line like "CG05" on its own reach across the line
// break into the next line's "CG05..." and misread its leading "CG05" as
// the letter+digit parts, producing garbage matches like "CG05CG05".
const VEHICLE_NO_RE = /CG[ \t]*[-]?[ \t]*(\d{2})[ \t]*[-]?[ \t]*([A-Za-z]{1,3})[ \t]*[-]?[ \t]*(\d{1,4})/gi

function extractVehicleNumbers(text: string): string[] {
  const found: string[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(VEHICLE_NO_RE)
  while ((m = re.exec(text)) !== null) {
    const vehicleNo = `CG${m[1]}${m[2].toUpperCase()}${m[3]}`
    found.push(vehicleNo)
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
            <p className="text-sm text-gray-500 mt-0.5">कोई भी डेटा पेस्ट करें — सिर्फ वाहन नंबर (CG...) निकाले जाएंगे</p>
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
