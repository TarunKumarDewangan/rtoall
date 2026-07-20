import Link from 'next/link'

const modules = [
  {
    href: '/backlog',
    title: 'Backlog Entries',
    subtitle: 'बैकलॉग प्रविष्टियां',
    desc: 'Vehicle registration backlog management',
    color: 'bg-blue-600',
    icon: '📋',
  },
  {
    href: '/backlog-received',
    title: 'Backlog Received',
    subtitle: 'प्राप्त फाइलें',
    desc: 'Track file/document transactions',
    color: 'bg-indigo-600',
    icon: '📁',
  },
  {
    href: '/ghoshnapatra',
    title: 'घोषणापत्र',
    subtitle: 'Ghoshnapatra Entries',
    desc: 'Vehicle owner declaration letters',
    color: 'bg-purple-600',
    icon: '📜',
  },
  {
    href: '/subsidy',
    title: 'Subsidy Entries',
    subtitle: 'सब्सिडी प्रविष्टियां',
    desc: 'Vehicle subsidy document tracking',
    color: 'bg-green-600',
    icon: '💰',
  },
  {
    href: '/work-done',
    title: 'Work Done Registry',
    subtitle: 'कार्य रजिस्टर',
    desc: 'Log completed work on vehicles',
    color: 'bg-orange-600',
    icon: '🔧',
  },
  {
    href: '/notesheets',
    title: 'Notesheets',
    subtitle: 'नोटशीट',
    desc: 'Office notes and memos',
    color: 'bg-teal-600',
    icon: '📝',
  },
  {
    href: '/modify-letters',
    title: 'Modification Letters',
    subtitle: 'संशोधन पत्र',
    desc: 'Multi-vehicle modification letters',
    color: 'bg-rose-600',
    icon: '✉️',
  },
  {
    href: '/import',
    title: 'Import Data',
    subtitle: 'डेटा आयात',
    desc: 'Import JSON/CSV data from old system',
    color: 'bg-gray-700',
    icon: '📥',
  },
]

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-blue-900">परिवहन विभाग, धमतरी</h1>
        <p className="text-gray-500 mt-1">Transport Department, Dhamtari — RTO Management System</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {modules.map(m => (
          <Link
            key={m.href}
            href={m.href}
            className="block bg-white rounded-xl shadow hover:shadow-md transition-shadow overflow-hidden group"
          >
            <div className={`${m.color} text-white px-5 py-4`}>
              <div className="text-3xl mb-1">{m.icon}</div>
              <div className="font-bold text-lg">{m.title}</div>
              <div className="text-sm opacity-80">{m.subtitle}</div>
            </div>
            <div className="px-5 py-3 text-sm text-gray-500 group-hover:text-gray-700">
              {m.desc} →
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
