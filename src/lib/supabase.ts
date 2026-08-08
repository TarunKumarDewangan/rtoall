import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// PostgREST caps select('*') at 1000 rows by default, so any table that can
// grow past that (subsidy, complaints, backlog, ...) silently truncates
// unless we page through it with .range(). Loops until a page comes back
// short of PAGE_SIZE, meaning we've reached the end.
export async function fetchAllRows<T>(
  table: string,
  orderColumn: string,
  ascending = false,
  select = '*'
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const PAGE_SIZE = 1000
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    all.push(...((data as T[]) || []))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: all, error: null }
}

// Same pagination trick, but for the "fetch every value of one column"
// pattern used by bulk-import duplicate checks (e.g. all existing vehicle
// numbers) — those must not silently miss rows past 1000 either.
export async function fetchAllColumnValues(table: string, column: string): Promise<string[]> {
  const PAGE_SIZE = 1000
  const all: string[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(column).range(from, from + PAGE_SIZE - 1)
    if (error || !data) break
    all.push(...data.map((row: any) => row[column]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

// Type definitions matching our database schema
export type BacklogEntry = {
  id?: number
  received_date: string | null
  given_by: string
  mobile_no: string
  vehicle_no: string
  chassis_no: string
  engine_no: string
  form22: string
  form21: string
  invoice: string
  rc: string
  first_inc: string
  work_needed: string
  remarks: string
  letter_making_date: string | null
  letter_no: string
  letter_sending_date: string | null
  letter_status: string
  print_lot: string
  file_link: string
  created_at?: string
}

export type BacklogReceived = {
  id?: number
  transaction_type: string
  received_date: string | null
  given_by: string
  given_to: string
  mobile_no: string
  vehicle_no: string
  remarks: string
  work_needed: string
  purpose: string
  created_at?: string
}

export type GhosnapatraEntry = {
  id?: number
  vehicle_no: string
  engine_no: string
  chassis_no: string
  model: string
  owner_name: string
  father_name: string
  verify_date: string | null
  verifier: string
  designation: string
  created_at?: string
}

export type ModifyLetter = {
  id?: number
  letter_subject: string
  vehicles_json: string
  created_at?: string
}

export type Notesheet = {
  id?: number
  note_date: string | null
  note_content: string
  created_at?: string
}

export type SubsidyEntry = {
  id?: number
  vehicle_no: string
  date_submitted: string | null
  entry_by: string
  has_receipt: boolean
  has_invoice: boolean
  has_passbook: boolean
  has_aadhaar: boolean
  has_rc: boolean
  created_at?: string
}

export type WorkDoneEntry = {
  id?: number
  work_date: string | null
  vehicle_no: string
  work_done: string
  brought_by: string
  reference: string
  created_at?: string
}

export type Complaint = {
  id?: number
  token_no: string
  owner_name: string
  complaint_date: string | null
  resolved_date: string | null
  department: string
  dept_head: string
  category: string
  topic: string
  description: string
  district: string
  login_user_id: string
  officer_name: string
  officer_designation: string
  officer_level: string
  status: string
  mobile_no: string
  remarks: string
  file_link: string
  created_at?: string
}

export type OfficerActivity = {
  level: string
  date: string
  name: string
  designation: string
  mobile: string
  resolution: string
  status: string
  documents: string
}

export type ComplaintV2 = {
  id?: number
  token_no: string
  owner_name: string
  complaint_date: string | null
  resolved_date: string | null
  department: string
  dept_head: string
  category: string
  topic: string
  description: string
  district: string
  block: string
  address: string
  login_user_id: string
  officer_name: string
  officer_designation: string
  officer_level: string
  status: string
  mobile_no: string
  complainant_documents: string
  officer_activities: OfficerActivity[]
  remarks: string
  file_link: string
  created_at?: string
}

export type SubsidyStatus = {
  id?: number
  vehicle_no: string
  owner_name: string
  mobile_no: string
  category: string
  ifsc: string
  account_no: string
  amount: number | null
  letter_no: string
  application_date: string | null
  transfer_date: string | null
  status: string
  registration_year: string
  remarks: string
  created_at?: string
}

export type ModifyStatus = {
  id?: number
  vehicle_no: string
  mobile_no: string
  correction_type: string
  letter_no: string
  letter_date: string | null
  send_date: string | null
  status: string
  remarks: string
  file_link: string
  created_at?: string
}

export type EvExtractedData = {
  id?: number
  vehicle_no: string
  created_at?: string
}

export type EvExcelStatusData = {
  id?: number
  vehicle_no: string
  batch_name: string
  created_at?: string
}

export type EvFinalV1Row = {
  id?: number
  row_data: Record<string, string>
  created_at?: string
}

export type CGTrans2022PendingRow = {
  id?: number
  row_data: Record<string, string>
  created_at?: string
}
