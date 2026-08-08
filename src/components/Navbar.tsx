'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type NavLink = { href: string; label: string }
type NavItem = NavLink | { label: string; children: NavLink[] }

const navItems: NavItem[] = [
  { href: '/', label: 'Home' },
  {
    label: 'Backlog',
    children: [
      { href: '/backlog', label: 'Backlog Entries' },
      { href: '/ghoshnapatra', label: 'घोषणापत्र' },
    ],
  },
  { href: '/backlog-received', label: 'File IN/Out' },
  {
    label: 'शिकायत',
    children: [
      { href: '/complaints', label: 'शिकायत v1' },
      { href: '/complaints-v2', label: 'शिकायत v2' },
    ],
  },
  {
    label: 'EV Subsidy',
    children: [
      { href: '/subsidy', label: 'Received Application' },
      { href: '/subsidy-status', label: 'EV Subsidy Status' },
      { href: '/subsidy-extractor', label: 'EV Subsidy Extractor' },
      { href: '/subsidy-extracted-data', label: 'EV Extracted Data' },
      { href: '/subsidy-excel-status', label: 'EV Extractor Excel Status' },
      { href: '/subsidy-excel-status-data', label: 'EV Excel Status Data' },
      { href: '/ev-final-v1', label: 'EV Final V1' },
      { href: '/cgtrans-2022-pending', label: 'CGTrans 2022 Pending' },
    ],
  },
  {
    label: 'Modify',
    children: [
      { href: '/modify-letters', label: 'Modify Letters' },
      { href: '/modify-status', label: 'Modify Status' },
    ],
  },
  {
    label: 'OfficeOW',
    children: [
      { href: '/work-done', label: 'Work Done' },
      { href: '/notesheets', label: 'Notesheets' },
    ],
  },
  { href: '/import', label: '📥 Import Data' },
  { href: '/compare-vehicles', label: '🔍 Compare Vehicles' },
]

function isGroup(item: NavItem): item is { label: string; children: NavLink[] } {
  return 'children' in item
}

export default function Navbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [mobileGroupOpen, setMobileGroupOpen] = useState<string | null>(null)
  const [desktopGroupOpen, setDesktopGroupOpen] = useState<string | null>(null)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setDesktopGroupOpen(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function groupIsActive(children: NavLink[]) {
    return children.some(c => c.href === pathname)
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-blue-900 text-white shadow-lg no-print">
      <div className="max-w-screen-xl mx-auto px-4 flex items-center justify-between h-16">
        <Link href="/" className="font-bold text-lg leading-tight">
          <span className="hidden sm:inline">परिवहन विभाग, धमतरी</span>
          <span className="sm:hidden">RTO Dhamtari</span>
        </Link>

        {/* Desktop nav */}
        <div ref={navRef} className="hidden lg:flex items-center gap-1">
          {navItems.map(item => {
            if (isGroup(item)) {
              const active = groupIsActive(item.children)
              const isOpen = desktopGroupOpen === item.label
              return (
                <div key={item.label} className="relative">
                  <button
                    onClick={() => setDesktopGroupOpen(isOpen ? null : item.label)}
                    className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1 ${
                      active ? 'bg-blue-700 font-semibold' : 'hover:bg-blue-800'
                    }`}
                  >
                    {item.label}
                    <span className={`text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                  {isOpen && (
                    <div className="absolute left-0 top-full mt-1 min-w-[180px] bg-blue-900 border border-blue-700 rounded-lg shadow-xl overflow-hidden">
                      {item.children.map(child => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setDesktopGroupOpen(null)}
                          className={`block px-4 py-2.5 text-sm transition-colors ${
                            pathname === child.href ? 'bg-blue-700 font-semibold' : 'hover:bg-blue-800'
                          }`}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  pathname === item.href ? 'bg-blue-700 font-semibold' : 'hover:bg-blue-800'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
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
          {navItems.map(item => {
            if (isGroup(item)) {
              const active = groupIsActive(item.children)
              const isOpen = mobileGroupOpen === item.label
              return (
                <div key={item.label} className="border-b border-blue-800">
                  <button
                    onClick={() => setMobileGroupOpen(isOpen ? null : item.label)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors ${
                      active ? 'bg-blue-800 font-semibold' : 'hover:bg-blue-900'
                    }`}
                  >
                    {item.label}
                    <span className={`text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                  {isOpen && (
                    <div className="bg-blue-900">
                      {item.children.map(child => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => { setOpen(false); setMobileGroupOpen(null) }}
                          className={`block pl-8 pr-4 py-3 text-sm border-t border-blue-800 transition-colors ${
                            pathname === child.href ? 'bg-blue-800 font-semibold' : 'hover:bg-blue-800'
                          }`}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-3 text-sm border-b border-blue-800 transition-colors ${
                  pathname === item.href ? 'bg-blue-800 font-semibold' : 'hover:bg-blue-900'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
    </nav>
  )
}
