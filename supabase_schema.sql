-- ============================================
-- RTO Management System - Supabase Schema
-- Transport Department, Dhamtari (परिवहन विभाग, धमतरी)
-- ============================================

-- Run this SQL in your Supabase SQL Editor

-- 1. Backlog Entries
CREATE TABLE IF NOT EXISTS backlog_entries (
  id SERIAL PRIMARY KEY,
  received_date DATE,
  given_by VARCHAR(100),
  mobile_no VARCHAR(20),
  vehicle_no VARCHAR(50),
  chassis_no VARCHAR(100),
  engine_no VARCHAR(100),
  form22 VARCHAR(10) DEFAULT 'NO',
  form21 VARCHAR(10) DEFAULT 'NO',
  invoice VARCHAR(10) DEFAULT 'NO',
  rc VARCHAR(10) DEFAULT 'NO',
  first_inc VARCHAR(10) DEFAULT 'NO',
  work_needed TEXT,
  remarks TEXT,
  letter_making_date DATE,
  letter_no VARCHAR(100),
  letter_sending_date DATE,
  letter_status VARCHAR(100) DEFAULT 'Pending',
  print_lot VARCHAR(50),
  file_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- If backlog_entries already exists from an earlier version, run this to add the new column:
-- ALTER TABLE backlog_entries ADD COLUMN IF NOT EXISTS file_link TEXT;

-- 2. Backlog Received (file/document transaction tracking)
CREATE TABLE IF NOT EXISTS backlog_received (
  id SERIAL PRIMARY KEY,
  transaction_type VARCHAR(255),
  received_date DATE,
  given_by VARCHAR(100),
  given_to VARCHAR(255),
  mobile_no VARCHAR(15),
  vehicle_no VARCHAR(20),
  remarks TEXT,
  work_needed TEXT,
  purpose VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Ghoshnapatra Entries
CREATE TABLE IF NOT EXISTS ghosnapatra_entries (
  id SERIAL PRIMARY KEY,
  vehicle_no VARCHAR(50),
  engine_no VARCHAR(50),
  chassis_no VARCHAR(50),
  model VARCHAR(100),
  owner_name VARCHAR(150),
  father_name VARCHAR(150),
  verify_date DATE,
  verifier VARCHAR(150),
  designation VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Modification Letters
CREATE TABLE IF NOT EXISTS modify_letters (
  id SERIAL PRIMARY KEY,
  letter_subject VARCHAR(255),
  vehicles_json TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Notesheets
CREATE TABLE IF NOT EXISTS notesheets (
  id SERIAL PRIMARY KEY,
  note_date DATE,
  note_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Subsidy Entries
CREATE TABLE IF NOT EXISTS subsidy_entries (
  id SERIAL PRIMARY KEY,
  vehicle_no VARCHAR(50),
  date_submitted DATE,
  entry_by VARCHAR(50),
  has_receipt BOOLEAN DEFAULT FALSE,
  has_invoice BOOLEAN DEFAULT FALSE,
  has_passbook BOOLEAN DEFAULT FALSE,
  has_aadhaar BOOLEAN DEFAULT FALSE,
  has_rc BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Work Done Registry
CREATE TABLE IF NOT EXISTS work_done_registry (
  id SERIAL PRIMARY KEY,
  work_date DATE,
  vehicle_no VARCHAR(50),
  work_done TEXT,
  brought_by VARCHAR(255),
  reference VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Complaints (शिकायत निवारण)
CREATE TABLE IF NOT EXISTS complaints (
  id SERIAL PRIMARY KEY,
  token_no VARCHAR(50),
  complaint_date DATE,
  resolved_date DATE,
  department VARCHAR(255),
  dept_head VARCHAR(255),
  category TEXT,
  description TEXT,
  district VARCHAR(100),
  login_user_id VARCHAR(100),
  officer_name VARCHAR(255),
  officer_designation VARCHAR(255),
  officer_level VARCHAR(20),
  status VARCHAR(50) DEFAULT 'Feedback Pending',
  mobile_no VARCHAR(20),
  remarks TEXT,
  file_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- If the complaints table already exists from an earlier version, run these to add the new columns:
-- ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolved_date DATE;
-- ALTER TABLE complaints ADD COLUMN IF NOT EXISTS officer_name VARCHAR(255);
-- ALTER TABLE complaints ADD COLUMN IF NOT EXISTS officer_designation VARCHAR(255);
-- ALTER TABLE complaints ADD COLUMN IF NOT EXISTS remarks TEXT;
-- ALTER TABLE complaints ADD COLUMN IF NOT EXISTS file_link TEXT;

-- 9. EV Subsidy Status (disbursement tracking, separate from Subsidy Entries' document checklist)
CREATE TABLE IF NOT EXISTS subsidy_status (
  id SERIAL PRIMARY KEY,
  vehicle_no VARCHAR(50),
  applicant_name VARCHAR(255),
  vehicle_category VARCHAR(100),
  amount NUMERIC(12,2),
  status VARCHAR(50) DEFAULT 'Pending',
  date_of_distribution DATE,
  letter_no VARCHAR(100),
  date_of_sending DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Enable Row Level Security (RLS) - optional, disable for internal use
-- ALTER TABLE backlog_entries ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no auth required for internal office use)
-- If you want public access (no login required), run these:
CREATE POLICY "Allow all" ON backlog_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON backlog_received FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON ghosnapatra_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON modify_letters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON notesheets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON subsidy_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON work_done_registry FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON complaints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON subsidy_status FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on all tables
ALTER TABLE backlog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlog_received ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghosnapatra_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE modify_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE notesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsidy_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_done_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsidy_status ENABLE ROW LEVEL SECURITY;
