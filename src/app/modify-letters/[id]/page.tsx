'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface WrongItem { item: string; value: string }
interface RightItem { value: string }
interface VehicleRow {
  vehicle_no: string
  vehicle_class: string
  error_reason: string
  wrong_items: WrongItem[]
  right_items: RightItem[]
}

export default function ModifyLetterViewPage() {
  const params = useParams()
  const id = params?.id
  const [letter, setLetter] = useState<Record<string, string> | null>(null)
  const [vehicles, setVehicles] = useState<VehicleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLetter = useCallback(async (letterId: string) => {
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
  }, [])

  useEffect(() => {
    if (id) fetchLetter(id as string)
  }, [id, fetchLetter])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>

  if (error || !letter) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error || 'Letter not found'}</p>
        <Link href="/modify-letters" className="text-blue-700 underline text-sm">Back to list</Link>
      </div>
    )
  }

  const currentYear = new Date().getFullYear()

  return (
    <>
      {/* Screen controls - hidden on print */}
      <div className="print:hidden bg-blue-900 text-white px-6 py-3 flex items-center justify-between">
        <Link href="/modify-letters" className="text-blue-200 hover:text-white text-sm">← Back to Letters</Link>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 rounded bg-white text-blue-900 text-sm font-semibold hover:bg-blue-50 transition"
        >
          🖨️ इस पत्र को प्रिंट करें
        </button>
      </div>

      {/* Letter - matches old PHP exactly */}
      <div style={{ fontFamily: "'Noto Sans Devanagari', sans-serif", margin: 0, backgroundColor: '#f0f2f5' }}>
        <div style={{
          maxWidth: '800px', minHeight: '1120px', margin: '30px auto',
          padding: '60px', background: 'white', boxShadow: '0 0 15px rgba(0,0,0,0.1)'
        }}>

          {/* Header */}
          <div style={{ textAlign: 'center', lineHeight: '1.6', marginBottom: '30px' }}>
            <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 700 }}>
              कार्यालय जिला परिवहन अधिकारी, धमतरी,
            </h1>
            <p style={{ margin: 0, fontSize: '1rem' }}>जिला-धमतरी छत्तीसगढ़</p>
            <p style={{ margin: 0, fontSize: '1rem' }}>(Email-dto-dhamtari.cg@gov.in)</p>
          </div>

          {/* Ref & Date line */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <span>क्रमांक............../जि.प.अ./25</span>
            <span>धमतरी, दिनांक............../................./&nbsp;{currentYear}</span>
          </div>

          {/* Address */}
          <div style={{ marginBottom: '25px', lineHeight: '1.8' }}>
            प्रति,<br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;सहायक परिवहन आयुक्त(आई.टी.),<br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;सी ब्लॉक, तृतीय तल, इन्द्रावती भवन,<br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;नवा रायपुर, अटल नगर, रायपुर छ०ग०
          </div>

          {/* Subject */}
          <div style={{ marginBottom: '25px', lineHeight: '1.8' }}>
            <b style={{ textDecoration: 'underline' }}>विषयः-&nbsp;&nbsp;मॉडिफाई एक्टिविटी प्रदान करने के संबंध में ।</b>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '20px' }}>----00----</div>

          {/* Body */}
          <div style={{ marginBottom: '25px', lineHeight: '1.8' }}>
            <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;उपरोक्त संदर्भित विषयांतर्गत लेख है कि विभिन्न वाहनों के त्रुटि-सुधार करने हेतु मॉडिफाई एक्टिविटी की आवश्यकता है, वाहनों के संबंध में जानकारी निम्नानुसार है:-</p>
          </div>

          {/* Table */}
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '20px' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #000', padding: '10px', textAlign: 'center', fontWeight: 700, width: '5%' }}>स.<br />क्र.</th>
                <th style={{ border: '1px solid #000', padding: '10px', textAlign: 'center', fontWeight: 700, width: '20%' }}>वाहन क्रमांक</th>
                <th style={{ border: '1px solid #000', padding: '10px', textAlign: 'center', fontWeight: 700, width: '25%' }}>त्रुटि का कारण</th>
                <th style={{ border: '1px solid #000', padding: '10px', textAlign: 'left', fontWeight: 700 }}>वाहन के संबंध में त्रुटि</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ border: '1px solid #000', padding: '10px', textAlign: 'center' }}>
                    कोई वाहन विवरण दर्ज नहीं किया गया।
                  </td>
                </tr>
              ) : vehicles.map((vehicle, index) => {
                const hasErrors = vehicle.wrong_items?.some(
                  (w, i) => (w.item || w.value || vehicle.right_items?.[i]?.value)
                )
                return (
                  <tr key={index}>
                    <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'center' }}>
                      {String(index + 1).padStart(2, '0')}.
                    </td>
                    <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'center' }}>
                      <b>{vehicle.vehicle_no}</b><br />
                      ({vehicle.vehicle_class})
                    </td>
                    <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'center' }}>
                      {vehicle.error_reason}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '10px', verticalAlign: 'top' }}>
                      {hasErrors ? (
                        <ol style={{ margin: 0, paddingLeft: '20px' }}>
                          {vehicle.wrong_items?.map((w, i) => {
                            const rightVal = vehicle.right_items?.[i]?.value || ''
                            if (!w.item && !w.value && !rightVal) return null
                            return (
                              <li key={i} style={{ marginBottom: '10px' }}>
                                {w.item} <b>{rightVal}</b> के स्थान पर त्रुटिवश <b>{w.value}</b> हो गया है।
                              </li>
                            )
                          })}
                        </ol>
                      ) : (
                        'कोई त्रुटि दर्ज नहीं की गई।'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Footer text */}
          <div style={{ marginTop: '30px', marginBottom: '25px', lineHeight: '1.8' }}>
            <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;अतः आपसे अनुरोध है कि उपरोक्त त्रुटियों के निराकरण करने हेतु मॉडिफाई एक्टिविटी प्रदान करने का कष्ट करें।</p>
          </div>

          {/* Signature */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '50px' }}>
            <div style={{ textAlign: 'center', fontWeight: 700 }}>
              जिला परिवहन अधिकारी,<br />
              धमतरी(छग)
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&display=swap');
        @media print {
          nav, .print\\:hidden { display: none !important; }
          body { margin: 0; background: white; }
          div[style*="backgroundColor: '#f0f2f5'"] { background: white !important; }
        }
      `}</style>
    </>
  )
}
