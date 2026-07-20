'use client'

import { useEffect, useState } from 'react'
import { supabase, Notesheet } from '@/lib/supabase'

const EMPTY_FORM = {
  note_date: '',
  note_content: '',
}

type FormType = typeof EMPTY_FORM

function formatDateDisplay(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function NotesheetsPage() {
  const [notesheets, setNotesheets] = useState<Notesheet[]>([])
  const [filtered, setFiltered] = useState<Notesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<Notesheet | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => { fetchNotesheets() }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(notesheets); return }
    const s = search.trim().toLowerCase()
    setFiltered(notesheets.filter((n: any) =>
      n.note_content?.toLowerCase().includes(s)
    ))
  }, [notesheets, search])

  async function fetchNotesheets() {
    setLoading(true)
    const { data, error } = await supabase
      .from('notesheets')
      .select('*')
      .order('note_date', { ascending: false })
    if (error) showMsg('error', error.message)
    else setNotesheets(data || [])
    setLoading(false)
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  function openAdd() {
    setEditEntry(null)
    setForm({ note_date: new Date().toISOString().split('T')[0], note_content: '' })
    setShowForm(true)
  }

  function openEdit(entry: Notesheet) {
    setEditEntry(entry)
    setForm({
      note_date: (entry as any).note_date || '',
      note_content: (entry as any).note_content || '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.note_content.trim()) { showMsg('error', 'Note content cannot be empty.'); return }
    setSaving(true)
    const payload = { ...form, note_date: form.note_date || null }
    let error: any
    if (editEntry && (editEntry as any).id) {
      ;({ error } = await supabase.from('notesheets').update(payload).eq('id', (editEntry as any).id))
    } else {
      ;({ error } = await supabase.from('notesheets').insert(payload))
    }
    setSaving(false)
    if (error) showMsg('error', error.message)
    else {
      showMsg('success', editEntry ? 'Notesheet updated!' : 'Notesheet added!')
      setShowForm(false)
      fetchNotesheets()
    }
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from('notesheets').delete().eq('id', id)
    setDeleteId(null)
    if (error) showMsg('error', error.message)
    else { showMsg('success', 'Notesheet deleted.'); fetchNotesheets() }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Notesheets</h1>
            <p className="text-sm text-gray-500 mt-0.5">{filtered.length} notes found</p>
          </div>
          <button onClick={openAdd} className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition">
            + New Notesheet
          </button>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="mb-5">
          <input
            type="text"
            placeholder="Search note content..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No notesheets found. Create your first note!</div>
        ) : (
          <div className="space-y-4">
            {filtered.map((note: any) => {
              const isExpanded = expandedId === note.id
              const preview = note.note_content?.slice(0, 200)
              const isLong = (note.note_content?.length || 0) > 200
              return (
                <div key={note.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-start justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-700 text-sm font-bold">N</span>
                      </div>
                      <div>
                        <p className="text-xs text-blue-700 font-semibold">{formatDateDisplay(note.note_date)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {note.note_content?.split('\n').length} line(s) · {note.note_content?.length} chars
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4 flex-shrink-0">
                      <button onClick={() => openEdit(note)} className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium">Edit</button>
                      <button onClick={() => setDeleteId(note.id)} className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">Delete</button>
                    </div>
                  </div>
                  <div className="px-5 pb-4">
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-serif">
                        {isExpanded ? note.note_content : (preview + (isLong ? '...' : ''))}
                      </p>
                      {isLong && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : note.id)}
                          className="mt-2 text-xs text-blue-600 hover:underline"
                        >
                          {isExpanded ? 'Show less' : 'Read more'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-5">{editEntry ? 'Edit Notesheet' : 'New Notesheet'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Note Date</label>
                <input type="date" value={form.note_date} onChange={e => setForm(f => ({ ...f, note_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Note Content</label>
                <textarea
                  value={form.note_content}
                  onChange={e => setForm(f => ({ ...f, note_content: e.target.value }))}
                  rows={10}
                  placeholder="Write the notesheet content here..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-serif focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <p className="text-xs text-gray-400 mt-1">{form.note_content.length} characters</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-lg bg-blue-900 text-white text-sm font-semibold hover:bg-blue-800 transition disabled:opacity-60">
                {saving ? 'Saving...' : editEntry ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-red-700 mb-2">Confirm Delete</h3>
            <p className="text-sm text-gray-600 mb-5">Are you sure you want to delete this notesheet?</p>
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
