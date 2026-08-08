import * as XLSX from 'xlsx'

// Normalizes a header cell for matching: lowercases, strips spaces and
// punctuation, keeps Devanagari so Hindi headers still match. This lets
// "Vehicle No", "VehicleNo", "vehicle_no" and "VEHICLE NO" all map the same.
function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ]/g, '')
}

export type ExcelParseResult =
  | { rows: Record<string, string>[] }
  | { error: string }

// Reads the first sheet of an uploaded Excel file, matches its header row
// against headerMap (normalized header text -> internal field key), and
// returns one object per data row keyed by field. Unknown/extra columns in
// the file are silently ignored; a missing required field fails the whole
// import with a clear message instead of importing partial data.
export async function parseExcelFile(
  file: File,
  headerMap: Record<string, string>,
  requiredFields: string[]
): Promise<ExcelParseResult> {
  let buf: ArrayBuffer
  try {
    buf = await file.arrayBuffer()
  } catch {
    return { error: 'Could not read the file.' }
  }

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buf, { type: 'array' })
  } catch {
    return { error: 'Not a valid Excel file (.xlsx/.xls/.csv).' }
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return { error: 'The Excel file has no sheets.' }

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
  if (raw.length === 0) return { error: 'The Excel file is empty.' }

  const headerRow = raw[0] as unknown[]
  const fieldForCol: (string | null)[] = headerRow.map(h => headerMap[normalizeHeader(h)] || null)

  const foundFields = new Set(fieldForCol.filter((f): f is string => !!f))
  const missing = requiredFields.filter(f => !foundFields.has(f))
  if (missing.length > 0) {
    return {
      error: `Missing required column(s) in the Excel header row: ${missing.join(', ')}. ` +
        `Found headers: ${headerRow.map(h => String(h)).filter(Boolean).join(', ') || '(none)'}`,
    }
  }

  const rows = raw
    .slice(1)
    .filter(r => (r as unknown[]).some(c => String(c ?? '').trim() !== ''))
    .map(r => {
      const obj: Record<string, string> = {}
      fieldForCol.forEach((field, i) => {
        if (field) obj[field] = String((r as unknown[])[i] ?? '').trim()
      })
      return obj
    })

  return { rows }
}

// Builds a one-sheet .xlsx from a header row + data rows and triggers a
// browser download — the export counterpart to parseExcelFile above.
export function exportToExcel(filename: string, headers: string[], rows: (string | number)[][]) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  XLSX.writeFile(workbook, filename)
}
