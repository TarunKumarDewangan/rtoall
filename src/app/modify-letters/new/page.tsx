'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface VehicleRow {
  vehicle_no: string
  wrong_value: string
  correct_value: string
  error_type: string
}

const EMPTY_VEHICLE: VehicleRow = {
  vehicle_no: '',
  wrong_value: '',
  correct_value: '',
  error_type: '',
}

const ERROR_TYPES = [
  'Engine No Error',
  'Chassis No Error',
  'Owner Name Error',
  'Father Name Error',
  'Address Error',
  'Date of Birth Error',
  'Vehicle Model Error',
  'Color Error',
  'Other',
]

export default function NewModifyLetterPage() {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [vehicles, setVehicles] = useState<VehicleRow[]>([{ ...EMPTY_VEHICLE }])
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function addVehicle() {
    setVehicles(v => [...v, { ...EMPTY_VEHICLE }])
  }

  function removeVehicle(index: number) {
    if (vehicles.length === 1) return
    setVehicles(v => v.filter((_, i) => i !== index))
  }

  function updateVehicle(index: number, field: keyof VehicleRow, value: string) {
    setVehicles(v => v.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  async function handleSave() {
    if (!subject.trim()) { showMsg('error', 'Letter subject is required.'); return }
    const validVehicles = vehicles.filter(v => v.vehicle_no.trim())
    if (validVehicles.length === 0) { showMsg('error', 'At least one vehicle number is required.'); return }

    setSaving(true)
    const { error } = await supabase.from('modify_letters').insert({
      letter_subject: subject.trim(),
      vehicles_json: JSON.stringify(validVehicles),
    })
    setSaving(false)

    if (error) {
      showMsg('error', error.message)
    } else {
      router.push('/modify-letters')
    }
  }

  const validVehicleCount = vehicles.filter(v => v.vehicle_no.trim()).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/modify-letters" className="text-sm text-blue-600 hover:underline">← Back to Letters</Link>
            <h1 className="text-2xl font-bold text-blue-900 mt-1">Create Modification Letter</h1>
          </div>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        {/* Letter Subject */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Letter Subject *</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="e.g., Correction of Engine Number in RC Record"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Vehicle Rows */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Vehicle Details ({validVehicleCount} valid)</h2>
            <button
              onClick={addVehicle}
              className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 text-xs font-semibold hover:bg-blue-50 transition"
            >
              + Add Row
            </button>
          </div>

          <div className="space-y-3">
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-1">
              <div className="col-span-1 text-xs font-semibold text-gray-500">#</div>
              <div className="col-span-2 text-xs font-semibold text-gray-500">Vehicle No *</div>
              <div className="col-span-3 text-xs font-semibold text-gray-500">Wrong Value</div>
              <div className="col-span-3 text-xs font-semibold text-gray-500">Correct Value</div>
              <div className="col-span-2 text-xs font-semibold text-gray-500">Error Type</div>
              <div className="col-span-1 text-xs font-semibold text-gray-500">Del</div>
            </div>

            {vehicles.map((row, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="sm:col-span-1 flex items-center">
                  <span className="text-xs text-gray-400 font-mono">{i + 1}</span>
                </div>
                <div className="sm:col-span-2">
                  <label className="sm:hidden text-xs text-gray-500 mb-1 block">Vehicle No *</label>
                  <input
                    type="text"
                    value={row.vehicle_no}
                    onChange={e => updateVehicle(i, 'vehicle_no', e.target.value.toUpperCase())}
                    placeholder="CG07AB1234"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="sm:hidden text-xs text-gray-500 mb-1 block">Wrong Value</label>
                  <input
                    type="text"
                    value={row.wrong_value}
                    onChange={e => updateVehicle(i, 'wrong_value', e.target.value)}
                    placeholder="Incorrect value..."
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="sm:hidden text-xs text-gray-500 mb-1 block">Correct Value</label>
                  <input
                    type="text"
                    value={row.correct_value}
                    onChange={e => updateVehicle(i, 'correct_value', e.target.value)}
                    placeholder="Correct value..."
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="sm:hidden text-xs text-gray-500 mb-1 block">Error Type</label>
                  <select
                    value={row.error_type}
                    onChange={e => updateVehicle(i, 'error_type', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="">Select type...</option>
                    {ERROR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-1 flex items-center">
                  <button
                    onClick={() => removeVehicle(i)}
                    disabled={vehicles.length === 1}
                    className="px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addVehicle}
            className="mt-3 w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 transition"
          >
            + Add Another Vehicle
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition"
          >
            {showPreview ? 'Hide Preview' : 'Preview Letter'}
          </button>
          <div className="flex gap-3">
            <Link href="/modify-letters" className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition">
              Cancel
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 rounded-lg bg-blue-900 text-white text-sm font-semibold hover:bg-blue-800 transition disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Letter'}
            </button>
          </div>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-8">
            <div className="text-center mb-6 border-b-2 border-gray-800 pb-4">
              <p className="text-xs font-medium text-gray-600">छत्तीसगढ़ शासन — परिवहन विभाग</p>
              <h2 className="text-xl font-bold text-gray-900 mt-1">संशोधन पत्र</h2>
              <p className="text-xs text-gray-500">जिला परिवहन कार्यालय, धमतरी</p>
            </div>
            <p className="text-sm font-semibold text-gray-800 mb-4">
              विषय: {subject || '(No subject entered)'}
            </p>
            {vehicles.filter(v => v.vehicle_no.trim()).length > 0 ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold">#</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold">Vehicle No</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold">Error Type</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold">Wrong Value</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold">Correct Value</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.filter(v => v.vehicle_no.trim()).map((v, i) => (
                    <tr key={i}>
                      <td className="border border-gray-300 px-3 py-2 text-xs">{i + 1}</td>
                      <td className="border border-gray-300 px-3 py-2 text-xs font-mono font-semibold">{v.vehicle_no}</td>
                      <td className="border border-gray-300 px-3 py-2 text-xs">{v.error_type || '—'}</td>
                      <td className="border border-gray-300 px-3 py-2 text-xs text-red-700">{v.wrong_value || '—'}</td>
                      <td className="border border-gray-300 px-3 py-2 text-xs text-green-700">{v.correct_value || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400 italic">No vehicles added yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
