# RTO Management System - Next.js + Supabase Setup

## Step 1: Create Supabase Project

1. Go to https://supabase.com and sign up (free)
2. Click "New Project"
3. Name: `rto-dhamtari`, choose a strong password, select closest region
4. Wait for project to be ready (~2 min)

## Step 2: Run the Database Schema

1. In Supabase dashboard → click **SQL Editor**
2. Open the file `supabase_schema.sql` from this project folder
3. Paste the entire content into the SQL Editor
4. Click **Run** — all 7 tables will be created

## Step 3: Get Your Supabase Keys

1. Go to **Settings → API** in your Supabase project
2. Copy:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (long JWT string)

## Step 4: Configure Environment

Edit the file `.env.local` in this project:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
```

## Step 5: Start the App

```bash
cd d:\realprojects\rto-nextjs
node ./node_modules/next/dist/bin/next dev
```

Open http://localhost:3000

## Step 6: Import Your Existing Data

1. Go to http://localhost:3000/import
2. Select the target table (e.g., "Backlog Entries")
3. Upload your `transport_db.json` file from the old PHP project (d:\realprojects\rtoallv2\transport_db.json)
4. Click **Start Import**
5. Repeat for each table

## Project Structure

```
src/app/
├── page.tsx              ← Dashboard (home)
├── backlog/page.tsx      ← Backlog Entries CRUD
├── backlog-received/     ← Backlog Received CRUD
├── ghoshnapatra/         ← Ghoshnapatra + print view
├── subsidy/              ← Subsidy Entries + bulk import
├── work-done/            ← Work Done Registry
├── notesheets/           ← Office Notesheets
├── modify-letters/       ← Modification Letters
└── import/page.tsx       ← Data Import Tool

src/lib/supabase.ts       ← Supabase client + TypeScript types
supabase_schema.sql       ← Database schema (run in Supabase SQL Editor)
```

## Features

- All 7 modules from the PHP system, rebuilt in Next.js
- Full CRUD (Create, Read, Update, Delete) for all tables
- Search and filter on all list pages  
- Status badges (Done, Sent, Whitelisted, etc.)
- Print-friendly views for Ghoshnapatra and Modification Letters
- Bulk vehicle import for Subsidy entries
- JSON/PHPMyAdmin data importer to migrate all old data
- Hindi (Devanagari) support throughout
- Mobile responsive design
