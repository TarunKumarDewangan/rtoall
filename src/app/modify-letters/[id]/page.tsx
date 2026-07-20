'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface VehicleRow {
  vehicle_no: string
  wrong_value: string
  correct_value: string
  error_type: string
}

function formatDateDisplay(dateStr: string | null) {
  if (!dateStr) return '___________'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function ModifyLetterViewPage() {
  const params = useParams()
  const id = params?.id
  const [letter, setLetter] = useState<any>(null)
  const [vehicles, setVehicles] = useState<VehicleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id) fetchLetter(id as string)
  }, [id])

  async function fetchLetter(letterId: string) {
    setLoading(true)
    const { data, error } = await supabase
      .from('modify_letters')
      .select('*')
      .eq('id', letterId)
      .single()
    if (error) {
      setError(error.message)
    } else {
      setLetter(data)
      try {
        setVehicles(JSON.parse(data.vehicles_json || '[]'))
      } catch {
        setVehicles([])
      }
    }
    setLoading(false)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (error || !letter) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error || 'Letter not found'}</p>
        <Link href="/modify-letters" className="text-blue-700 underline text-sm">Back to list</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Screen Controls */}
      <div className="print:hidden bg-blue-900 text-white px-6 py-3 flex items-center justify-between">
        <Link href="/modify-letters" className="text-blue-200 hover:text-white text-sm">← Back to Letters</Link>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 rounded bg-white text-blue-900 text-sm font-semibold hover:bg-blue-50 transition"
        >
          Print Letter
        </button>
      </div>

      {/* Printable Letter */}
      <div className="max-w-4xl mx-auto my-8 print:my-0 bg-white shadow-lg print:shadow-none p-12 print:p-8">
        {/* Government Header */}
        <div className="text-center mb-6 border-b-2 border-gray-800 pb-4">
          <p className="text-sm font-bold text-gray-700">छत्तीसगढ़ शासन</p>
          <p className="text-sm font-medium text-gray-600">परिवहन विभाग, धमतरी (छ.ग.)</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">संशोधन / त्रुटि सुधार पत्र</h1>
          <p className="text-xs text-gray-500 mt-1">जिला परिवहन कार्यालय, धमतरी</p>
        </div>

        {/* Reference and Date */}
        <div className="flex justify-between text-sm text-gray-700 mb-6">
          <div>
            <span className="font-semibold">पत्र क्र.:</span> __________ / __________
          </div>
          <div>
            <span className="font-semibold">दिनांक:</span> {formatDateDisplay(letter.created_at)}
          </div>
        </div>

        {/* Subject */}
        <div className="mb-6">
          <p className="text-sm text-gray-800">
            <span className="font-bold">विषय:</span> {letter.letter_subject}
          </p>
        </div>

        {/* Salutation */}
        <div className="mb-5 text-sm text-gray-800">
          <p>सेवा में,</p>
          <p className="mt-1 ml-4">श्रीमान् क्षेत्रीय परिवहन अधिकारी,</p>
          <p className="ml-4">रायपुर (छ.ग.)</p>
        </div>

        {/* Body */}
        <div className="mb-6 text-sm text-gray-800 leading-relaxed">
          <p>
            महोदय,
          </p>
          <p className="mt-3 ml-4">
            उपरोक्त विषय के संदर्भ में सविनय निवेदन है कि इस कार्यालय में पंजीकृत निम्नांकित वाहनों के
            पंजीयन अभिलेखों में त्रुटि पाई गई है। अतः कृपया संबंधित अभिलेखों में आवश्यक संशोधन किया जाए।
          </p>
        </div>

        {/* Vehicles Table */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-gray-800 mb-3">त्रुटि विवरण:</h3>
          {vehicles.length > 0 ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 px-3 py-2 text-left text-xs font-bold">क्र.</th>
                  <th className="border border-gray-400 px-3 py-2 text-left text-xs font-bold">वाहन पंजीयन क्र.</th>
                  <th className="border border-gray-400 px-3 py-2 text-left text-xs font-bold">त्रुटि का प्रकार</th>
                  <th className="border border-gray-400 px-3 py-2 text-left text-xs font-bold">गलत अंकन</th>
                  <th className="border border-gray-400 px-3 py-2 text-left text-xs font-bold">सही अंकन</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-400 px-3 py-2 text-xs">{i + 1}</td>
                    <td className="border border-gray-400 px-3 py-2 text-xs font-mono font-bold">{v.vehicle_no || '—'}</td>
                    <td className="border border-gray-400 px-3 py-2 text-xs">{v.error_type || '—'}</td>
                    <td className="border border-gray-400 px-3 py-2 text-xs text-red-700 font-medium">{v.wrong_value || '—'}</td>
                    <td className="border border-gray-400 px-3 py-2 text-xs text-green-700 font-medium">{v.correct_value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400 italic">कोई वाहन विवरण नहीं।</p>
          )}
        </div>

        {/* Closing */}
        <div className="mb-10 text-sm text-gray-800">
          <p>अतः उपरोक्त विवरण के अनुसार संशोधन किए जाने की कृपा करें।</p>
          <p className="mt-3">सादर धन्यवाद।</p>
        </div>

        {/* Signatures */}
        <div className="flex justify-between items-end mt-16">
          <div className="text-center">
            <div className="border-t border-gray-800 pt-2 px-10">
              <p className="text-sm font-semibold text-gray-700">आवेदक / संबंधित अधिकारी</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-800 pt-2 px-10">
              <p className="text-sm font-semibold text-gray-700">जिला परिवहन अधिकारी</p>
              <p className="text-xs text-gray-500">धमतरी, छत्तीसगढ़</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">
            जिला परिवहन कार्यालय, धमतरी, छत्तीसगढ़ — दिनांक: {formatDateDisplay(letter.created_at)}
          </p>
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
