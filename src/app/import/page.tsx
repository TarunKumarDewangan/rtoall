'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type TableName =
  | 'backlog_entries'
  | 'backlog_received'
  | 'ghosnapatra_entries'
  | 'subsidy_entries'
  | 'work_done_registry'
  | 'notesheets'
  | 'modify_letters'

const TABLE_OPTIONS: { value: TableName; label: string; phpJsonKey: string }[] = [
  { value: 'backlog_entries', label: 'Backlog Entries', phpJsonKey: 'backlog_entries' },
  { value: 'backlog_received', label: 'Backlog Received', phpJsonKey: 'backlog_received' },
  { value: 'ghosnapatra_entries', label: 'Ghoshnapatra Entries', phpJsonKey: 'ghosnapatra_entries' },
  { value: 'subsidy_entries', label: 'Subsidy Entries', phpJsonKey: 'subsidy_entries' },
  { value: 'work_done_registry', label: 'Work Done Registry', phpJsonKey: 'work_done_registry' },
  { value: 'notesheets', label: 'Notesheets', phpJsonKey: 'notesheets' },
  { value: 'modify_letters', label: 'Modification Letters', phpJsonKey: 'modify_letters' },
]

// Field mappings from old PHP DB column names to Supabase column names
const FIELD_MAP: Record<TableName, Record<string, string>> = {
  backlog_entries: {
    PrintLot: 'print_lot',
  },
  backlog_received: {},
  ghosnapatra_entries: {},
  subsidy_entries: {
    has_receipt: 'has_receipt',
    has_invoice: 'has_invoice',
    has_passbook: 'has_passbook',
    has_aadhaar: 'has_aadhaar',
    has_rc: 'has_rc',
  },
  work_done_registry: {},
  notesheets: {},
  modify_letters: {
    vehicles_json: 'vehicles_json',
  },
}

// Fields to EXCLUDE (old PHP DB auto fields we don't need to import)
const EXCLUDE_FIELDS: Record<TableName, string[]> = {
  backlog_entries: ['id'],
  backlog_received: ['id'],
  ghosnapatra_entries: ['id'],
  subsidy_entries: ['id'],
  work_done_registry: ['id'],
  notesheets: ['id'],
  modify_letters: ['id'],
}

function transformRecord(table: TableName, record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const excludes = EXCLUDE_FIELDS[table] || []
  const fieldMap = FIELD_MAP[table] || {}

  for (const [key, value] of Object.entries(record)) {
    if (excludes.includes(key)) continue

    // Apply field name remapping
    const newKey = fieldMap[key] || key

    // Convert MySQL tinyint (0/1) to boolean for subsidy fields
    if (table === 'subsidy_entries' && ['has_receipt', 'has_invoice', 'has_passbook', 'has_aadhaar', 'has_rc'].includes(newKey)) {
      result[newKey] = value === 1 || value === '1' || value === true
    } else if (value === '' || value === null) {
      result[newKey] = null
    } else {
      result[newKey] = value
    }
  }
  return result
}

export default function ImportPage() {
  const [selectedTable, setSelectedTable] = useState<TableName>('backlog_entries')
  const [jsonText, setJsonText] = useState('')
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [log, setLog] = useState<string[]>([])
  const [importedCount, setImportedCount] = useState(0)
  const [errorCount, setErrorCount] = useState(0)

  function addLog(msg: string) {
    setLog(prev => [...prev, msg])
  }

  async function handleImport() {
    setStatus('processing')
    setLog([])
    setImportedCount(0)
    setErrorCount(0)

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText.trim())
    } catch {
      setStatus('error')
      setLog(['❌ Invalid JSON. Please paste valid JSON data.'])
      return
    }

    // Accept multiple formats:
    // 1. Array of records: [{...}, {...}]
    // 2. PHPMyAdmin export format: [{type:"header",...}, {type:"table", name:"...", data:[...]}]
    // 3. Object with table name as key: { "backlog_entries": [{...}] }
    let records: Record<string, unknown>[] = []

    if (Array.isArray(parsed)) {
      // Check if it's PHPMyAdmin JSON export format
      const phpHeader = (parsed as Record<string, unknown>[]).find(
        (r) => r.type === 'header'
      )
      if (phpHeader) {
        // PHPMyAdmin format — find the table matching selectedTable
        const tableEntry = (parsed as Record<string, unknown>[]).find(
          (r) => r.type === 'table'
        )
        if (tableEntry && Array.isArray(tableEntry.data)) {
          records = tableEntry.data as Record<string, unknown>[]
          addLog(`✅ Detected PHPMyAdmin export format. Table: ${tableEntry.name}. Found ${records.length} records.`)
        } else {
          setStatus('error')
          setLog(['❌ PHPMyAdmin format detected but no table data found.'])
          return
        }
      } else {
        // Plain array of records
        records = parsed as Record<string, unknown>[]
        addLog(`✅ Detected plain JSON array. Found ${records.length} records.`)
      }
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Object format: { "table_name": [...] } or full PHPMyAdmin with multiple tables
      const obj = parsed as Record<string, unknown>
      // Try to find by selected table name
      if (Array.isArray(obj[selectedTable])) {
        records = obj[selectedTable] as Record<string, unknown>[]
        addLog(`✅ Detected object format. Key: ${selectedTable}. Found ${records.length} records.`)
      } else {
        // Take the first array value found
        for (const key of Object.keys(obj)) {
          if (Array.isArray(obj[key])) {
            records = obj[key] as Record<string, unknown>[]
            addLog(`✅ Using key "${key}". Found ${records.length} records.`)
            break
          }
        }
      }
    }

    if (records.length === 0) {
      setStatus('error')
      setLog(['❌ No records found in the provided JSON.'])
      return
    }

    // Import in batches of 50
    const batchSize = 50
    let imported = 0
    let errors = 0

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map(r => transformRecord(selectedTable, r))
      const { error } = await supabase.from(selectedTable).insert(batch)
      if (error) {
        errors += batch.length
        addLog(`❌ Batch ${Math.floor(i / batchSize) + 1} failed: ${error.message}`)
      } else {
        imported += batch.length
        addLog(`✅ Batch ${Math.floor(i / batchSize) + 1}: imported ${batch.length} records (total: ${imported})`)
      }
      setImportedCount(imported)
      setErrorCount(errors)
    }

    setStatus('done')
    addLog(`\n🎉 Import complete! ${imported} imported, ${errors} failed.`)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setJsonText(ev.target?.result as string)
    }
    reader.readAsText(file)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-blue-900 mb-2">📥 Import Data</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Import existing data from your PHP/MySQL system into Supabase. Paste JSON or upload a file.
        Supports PHPMyAdmin JSON export format and plain JSON arrays.
      </p>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm">
        <h2 className="font-semibold text-blue-800 mb-2">How to export from your old system:</h2>
        <ol className="list-decimal list-inside space-y-1 text-blue-700">
          <li>Open <strong>phpMyAdmin</strong> → select your <code>transport_db</code> database</li>
          <li>Click on a table (e.g. <code>backlog_entries</code>)</li>
          <li>Click <strong>Export</strong> → Format: <strong>JSON</strong> → Go</li>
          <li>Upload the downloaded .json file below, OR paste the JSON content</li>
          <li>Or use the existing <code>transport_db.json</code> file in your project root</li>
        </ol>
        <p className="mt-2 text-blue-600">
          <strong>Tip:</strong> The <code>transport_db.json</code> file in your rtoallv2 folder is already in the right format!
        </p>
      </div>

      <div className="bg-white rounded-xl shadow p-6 space-y-5">
        {/* Table selector */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Target Table (where to import)
          </label>
          <select
            value={selectedTable}
            onChange={e => setSelectedTable(e.target.value as TableName)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TABLE_OPTIONS.map(t => (
              <option key={t.value} value={t.value}>
                {t.label} ({t.value})
              </option>
            ))}
          </select>
        </div>

        {/* File upload */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Upload JSON File
          </label>
          <input
            type="file"
            accept=".json,.txt"
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
        </div>

        {/* JSON textarea */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Or Paste JSON Data
          </label>
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            rows={12}
            placeholder={`Paste your JSON here. Accepted formats:\n\n1. PHPMyAdmin export: [{\"type\":\"header\",...}, {\"type\":\"table\", \"name\":\"backlog_entries\", \"data\":[...]}]\n\n2. Plain array: [{\"vehicle_no\":\"CG05E1234\", ...}, ...]\n\n3. Object: {\"backlog_entries\": [{...}]}`}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {jsonText && (
            <p className="text-xs text-gray-400 mt-1">
              {jsonText.length.toLocaleString()} characters pasted
            </p>
          )}
        </div>

        {/* Import button */}
        <button
          onClick={handleImport}
          disabled={!jsonText.trim() || status === 'processing'}
          className="w-full bg-blue-700 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'processing' ? '⏳ Importing...' : '🚀 Start Import'}
        </button>

        {/* Results */}
        {status !== 'idle' && (
          <div className={`rounded-lg border p-4 ${
            status === 'done' ? 'bg-green-50 border-green-200' :
            status === 'error' ? 'bg-red-50 border-red-200' :
            'bg-yellow-50 border-yellow-200'
          }`}>
            {status === 'done' && (
              <div className="flex gap-4 mb-3 text-sm font-semibold">
                <span className="text-green-700">✅ Imported: {importedCount}</span>
                {errorCount > 0 && <span className="text-red-700">❌ Failed: {errorCount}</span>}
              </div>
            )}
            <div className="text-xs font-mono space-y-0.5 max-h-48 overflow-y-auto">
              {log.map((line, i) => (
                <div key={i} className={line.startsWith('❌') ? 'text-red-700' : 'text-gray-700'}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick import guide */}
      <div className="mt-6 bg-white rounded-xl shadow p-6">
        <h2 className="font-semibold text-gray-800 mb-3">Import All Tables at Once</h2>
        <p className="text-sm text-gray-600 mb-3">
          Your <code className="bg-gray-100 px-1 rounded">transport_db.json</code> file contains all tables.
          To import each table:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
          {TABLE_OPTIONS.map((t, i) => (
            <li key={t.value}>
              Select <strong>{t.label}</strong> above → upload the JSON → click Import
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          The importer automatically detects PHPMyAdmin format and extracts the correct table data.
          It will skip the <code>id</code> field so Supabase auto-assigns new IDs.
        </p>
      </div>
    </div>
  )
}
