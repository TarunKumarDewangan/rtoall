'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, ModifyLetter } from '@/lib/supabase'
import PinModal from '@/components/PinModal'

function formatDateDisplay(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ModifyLettersPage() {
  const [letters, setLetters] = useState<ModifyLetter[]>([])
  const [filtered, setFiltered] = useState<ModifyLetter[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [pinDeleteId, setPinDeleteId] = useState<number | null>(null)

  useEffect(() => { fetchLetters() }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(letters); return }
    const s = search.trim().toLowerCase()
    setFiltered(letters.filter((l: any) =>
      l.letter_subject?.toLowerCase().includes(s)
    ))
  }, [letters, search])

  async function fetchLetters() {
    setLoading(true)
    const { data, error } = await supabase
      .from('modify_letters')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) showMsg('error', error.message)
    else setLetters(data || [])
    setLoading(false)
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from('modify_letters').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Letter deleted.'); fetchLetters() }
  }

  function getVehicleCount(vehiclesJson: string | null) {
    if (!vehiclesJson) return 0
    try { return JSON.parse(vehiclesJson).length } catch { return 0 }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-lg mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Modification Letters</h1>
            <p className="text-sm text-gray-500 mt-0.5">Total: {filtered.length} letters</p>
          </div>
          <Link
            href="/modify-letters/new"
            className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition"
          >
            + Create Letter
          </Link>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by letter subject..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">No modification letters yet</p>
            <Link href="/modify-letters/new" className="text-blue-600 hover:underline text-sm">Create your first letter</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((letter: any, i) => {
              const vehicleCount = getVehicleCount(letter.vehicles_json)
              return (
                <div key={letter.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-900 flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{i + 1}</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{letter.letter_subject || 'Untitled Letter'}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500">{formatDateDisplay(letter.created_at)}</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                          {vehicleCount} vehicle{vehicleCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/modify-letters/${letter.id}`}
                      className="px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 text-xs font-semibold transition"
                    >
                      View / Print
                    </Link>
                    <button
                      onClick={() => setPinDeleteId(letter.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-xs font-semibold transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* PIN Modal */}
      {pinDeleteId !== null && (
        <PinModal
          action="delete this modification letter"
          onSuccess={() => { setDeleteId(pinDeleteId); setPinDeleteId(null) }}
          onCancel={() => setPinDeleteId(null)}
        />
      )}

      {/* Delete Confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-red-700 mb-2">Confirm Delete</h3>
            <p className="text-sm text-gray-600 mb-5">Are you sure you want to delete this modification letter? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
