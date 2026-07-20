'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function GhoshnapatraLetterPage() {
  const params = useParams()
  const id = params?.id
  const [entry, setEntry] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id) fetchEntry(id as string)
  }, [id])

  async function fetchEntry(entryId: string) {
    setLoading(true)
    const { data, error } = await supabase
      .from('ghosnapatra_entries')
      .select('*')
      .eq('id', entryId)
      .single()
    if (error) setError(error.message)
    else setEntry(data)
    setLoading(false)
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '___________'
    const d = new Date(dateStr)
    return d.toLocaleDateString('hi-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error || 'Entry not found'}</p>
        <Link href="/ghoshnapatra" className="text-blue-700 underline text-sm">Back to list</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Screen Controls - hidden on print */}
      <div className="print:hidden bg-blue-900 text-white px-6 py-3 flex items-center justify-between">
        <Link href="/ghoshnapatra" className="text-blue-200 hover:text-white text-sm">← Back to Ghoshnapatra List</Link>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 rounded bg-white text-blue-900 text-sm font-semibold hover:bg-blue-50 transition"
        >
          Print Letter
        </button>
      </div>

      {/* Printable Letter */}
      <div className="max-w-3xl mx-auto my-8 print:my-0 bg-white shadow-lg print:shadow-none p-12 print:p-8">
        {/* Government Header */}
        <div className="text-center mb-8 border-b-2 border-gray-800 pb-4">
          <p className="text-sm font-medium text-gray-600">छत्तीसगढ़ शासन</p>
          <p className="text-sm font-medium text-gray-600">परिवहन विभाग</p>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">घोषणापत्र</h1>
          <p className="text-sm text-gray-600 mt-1">जिला परिवहन कार्यालय, धमतरी (छ.ग.)</p>
        </div>

        {/* Intro Statement */}
        <div className="mb-6 text-gray-800 leading-relaxed">
          <p className="text-base">
            मैं, <span className="font-bold underline">{entry.owner_name || '_______________'}</span>,
            पुत्र / पुत्री श्री <span className="font-bold underline">{entry.father_name || '_______________'}</span>,
            यह घोषणापत्र प्रस्तुत करता / करती हूँ कि मेरे वाहन का विवरण निम्नानुसार है:
          </p>
        </div>

        {/* Vehicle Details Table */}
        <div className="mb-8">
          <h2 className="text-base font-bold text-gray-800 mb-3 border-b border-gray-300 pb-1">वाहन विवरण</h2>
          <table className="w-full border-collapse">
            <tbody>
              {[
                ['वाहन पंजीयन क्रमांक', entry.vehicle_no],
                ['इंजन क्रमांक', entry.engine_no],
                ['चेसिस क्रमांक', entry.chassis_no],
                ['मॉडल', entry.model],
              ].map(([label, value]) => (
                <tr key={label} className="border border-gray-300">
                  <td className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-50 w-48">{label}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-900 font-mono">{value || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Declaration Text */}
        <div className="mb-8 text-gray-800 leading-relaxed space-y-3">
          <p className="text-sm">
            मैं घोषणा करता / करती हूँ कि उक्त वाहन का विवरण सत्य एवं सही है। यदि उपरोक्त जानकारी
            किसी भी प्रकार से असत्य पाई जाती है तो मैं उसके लिए पूर्णतः उत्तरदायी हूँगा / हूँगी।
          </p>
          <p className="text-sm">
            सत्यापन दिनांक: <span className="font-bold">{formatDate(entry.verify_date)}</span>
          </p>
        </div>

        {/* Verifier Details */}
        <div className="mb-10">
          <h2 className="text-base font-bold text-gray-800 mb-3 border-b border-gray-300 pb-1">सत्यापनकर्ता विवरण</h2>
          <table className="w-full border-collapse">
            <tbody>
              {[
                ['सत्यापनकर्ता का नाम', entry.verifier],
                ['पदनाम', entry.designation],
                ['सत्यापन दिनांक', formatDate(entry.verify_date)],
              ].map(([label, value]) => (
                <tr key={label} className="border border-gray-300">
                  <td className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-50 w-48">{label}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-900">{value || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div className="flex justify-between items-end mt-16">
          <div className="text-center">
            <div className="border-t border-gray-800 pt-2 px-8">
              <p className="text-sm font-semibold text-gray-700">आवेदक के हस्ताक्षर</p>
              <p className="text-xs text-gray-500">{entry.owner_name}</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-800 pt-2 px-8">
              <p className="text-sm font-semibold text-gray-700">सत्यापनकर्ता के हस्ताक्षर</p>
              <p className="text-xs text-gray-500">{entry.verifier}</p>
              <p className="text-xs text-gray-500">{entry.designation}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">जिला परिवहन कार्यालय, धमतरी, छत्तीसगढ़</p>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:my-0 { margin-top: 0 !important; margin-bottom: 0 !important; }
          .print\\:p-8 { padding: 2rem !important; }
        }
      `}</style>
    </div>
  )
}
