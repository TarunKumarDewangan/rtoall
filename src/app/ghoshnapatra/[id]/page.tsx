'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function GhoshnapatraLetterPage() {
  const params = useParams()
  const id = params?.id
  const [entry, setEntry] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEntry = useCallback(async (entryId: string) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('ghosnapatra_entries')
      .select('*')
      .eq('id', entryId)
      .single()
    if (error) setError(error.message)
    else setEntry(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (id) fetchEntry(id as string)
  }, [id, fetchEntry])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>

  if (error || !entry) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error || 'Entry not found'}</p>
        <Link href="/ghoshnapatra" className="text-blue-700 underline text-sm">Back to list</Link>
      </div>
    )
  }

  return (
    <>
      {/* Screen controls - hidden on print */}
      <div className="print:hidden bg-blue-900 text-white px-6 py-3 flex items-center justify-between">
        <Link href="/ghoshnapatra" className="text-blue-200 hover:text-white text-sm">← Back to Ghoshnapatra List</Link>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 rounded bg-white text-blue-900 text-sm font-semibold hover:bg-blue-50 transition"
        >
          🖨️ Print Letter
        </button>
      </div>

      {/* Letter — matches old PHP exactly */}
      <div id="letter" style={{
        fontFamily: "'Noto Sans Devanagari', sans-serif",
        margin: '60px',
        lineHeight: '1.9',
        fontSize: '18px',
        color: '#111',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '35px' }}>
          कार्यालय जिला परिवहन अधिकारी, धमतरी (छ.ग.)
        </div>
        <div style={{ textAlign: 'center', marginBottom: '25px' }}>
          Email Id- <a href="mailto:dto-dhamtari.cg@gov.in" style={{ color: '#0000EE' }}>dto-dhamtari.cg@gov.in</a>
        </div>

        {/* Title */}
        <h2 style={{ textAlign: 'center', textDecoration: 'underline' }}>घोषणा पत्र</h2>

        {/* Body content */}
        <div style={{ textAlign: 'justify' }}>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; वाहन स्वामी द्वारा अपने वाहन क्रमांक <b>{entry.vehicle_no}</b>,
          &nbsp;इंजन क्रमांक <b>{entry.engine_no}</b>,
          &nbsp;चेसिस क्रमांक <b>{entry.chassis_no}</b>,
          &nbsp;मॉडल <b>{entry.model}</b>&nbsp;
          जो कि श्री/श्रीमती <b>{entry.owner_name}</b>,
          &nbsp;पिता/पति <b>{entry.father_name}</b> के नाम पर पंजीकृत है।
          &nbsp;वाहन स्वामी द्वारा वाहन की मूल पंजीयन पुस्तिका के साथ वाहन का रिकॉर्ड वाहन 4.0 में ऑनलाइन (बैकलॉग) किये जाने हेतु आवेदन प्रस्तुत किया गया है।
          <br /><br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;वाहन का भौतिक सत्यापन दिनांक <b>{entry.verify_date}</b> को&nbsp;
          श्री/श्रीमती <b>{entry.verifier}</b>,
          &nbsp;पदनाम <b>{entry.designation}</b> के द्वारा किया गया है।
        </div>

        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '80px' }}>
          {/* Applicant signature */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: '8px', minWidth: '180px' }}>
              <div style={{ fontWeight: 'bold' }}>आवेदक के हस्ताक्षर</div>
              <div>{entry.owner_name}</div>
            </div>
          </div>

          {/* RTO signature */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: '8px', minWidth: '220px' }}>
              <div style={{ fontWeight: 'bold' }}>
                जिला परिवहन अधिकारी,<br />
                धमतरी (छ.ग.)
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@500&display=swap');
        @media print {
          nav, .print\\:hidden { display: none !important; }
          body { margin: 0; background: white; }
        }
      `}</style>
    </>
  )
}
