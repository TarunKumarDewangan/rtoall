import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  complaint_date: string | null
  resolved_date: string | null
  department: string
  dept_head: string
  category: string
  description: string
  district: string
  login_user_id: string
  officer_name: string
  officer_designation: string
  officer_level: string
  status: string
  mobile_no: string
  created_at?: string
}
