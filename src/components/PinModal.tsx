'use client'
import { useState, useRef, useEffect } from 'react'

const CORRECT_PIN = '71727378'

interface Props {
  onSuccess: () => void
  onCancel: () => void
  action?: string
}

export default function PinModal({ onSuccess, onCancel, action = 'this action' }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit() {
    if (pin === CORRECT_PIN) {
      setError(false)
      onSuccess()
    } else {
      setError(true)
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center">
      <div className={`bg-white rounded-2xl shadow-2xl p-6 w-80 mx-4 border-2 border-blue-200 ${shake ? 'animate-shake' : ''}`}>
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">🔐</div>
          <h3 className="text-lg font-bold text-blue-900">Enter PIN</h3>
          <p className="text-xs text-gray-500 mt-1">PIN required to {action}</p>
        </div>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(false) }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Enter 8-digit PIN"
          className={`w-full border-2 rounded-lg px-4 py-3 text-center text-xl font-mono tracking-widest focus:outline-none mb-3 ${
            error ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-blue-500'
          }`}
        />

        {error && (
          <p className="text-red-600 text-xs text-center mb-3 font-semibold">❌ Incorrect PIN. Try again.</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={pin.length === 0}
            className="flex-1 py-2 rounded-lg bg-blue-900 text-white text-sm font-semibold hover:bg-blue-800 transition disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  )
}
