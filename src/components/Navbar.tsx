'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/backlog', label: 'Backlog Entries' },
  { href: '/backlog-received', label: 'Backlog Received' },
  { href: '/complaints', label: 'शिकायत' },
  { href: '/ghoshnapatra', label: 'घोषणापत्र' },
  { href: '/subsidy', label: 'Subsidy' },
  { href: '/work-done', label: 'Work Done' },
  { href: '/notesheets', label: 'Notesheets' },
  { href: '/modify-letters', label: 'Modify Letters' },
  { href: '/import', label: '📥 Import Data' },
]

export default function Navbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-blue-900 text-white shadow-lg no-print">
      <div className="max-w-screen-xl mx-auto px-4 flex items-center justify-between h-16">
        <Link href="/" className="font-bold text-lg leading-tight">
          <span className="hidden sm:inline">परिवहन विभाग, धमतरी</span>
          <span className="sm:hidden">RTO Dhamtari</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-1">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                pathname === link.href
                  ? 'bg-blue-700 font-semibold'
                  : 'hover:bg-blue-800'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden p-2 rounded hover:bg-blue-800"
          onClick={() => setOpen(!open)}
        >
          <span className="block w-5 h-0.5 bg-white mb-1"></span>
          <span className="block w-5 h-0.5 bg-white mb-1"></span>
          <span className="block w-5 h-0.5 bg-white"></span>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden bg-blue-950 border-t border-blue-800">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-3 text-sm border-b border-blue-800 transition-colors ${
                pathname === link.href ? 'bg-blue-800 font-semibold' : 'hover:bg-blue-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}
