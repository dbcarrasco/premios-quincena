# Premios de la Quincena

A humorous Mexican web app where users upload their bank statement CSV
and receive a roast of their spending habits, formatted as a shareable
WhatsApp message. Repeat users can see how their bad habits evolve month
over month.

## Stack
- Next.js (App Router)
- Tailwind CSS for styling
- Supabase for database (anonymous session tracking + monthly summaries)
- Deploy to Vercel

## Key rules
- Mobile-first design, it will mostly be used on phones
- Spanish language throughout, Mexican tone — casual, funny, not formal
- CSV parsing happens client-side — raw transactions never leave the browser
- Only aggregated, anonymized summaries are stored in Supabase (no raw
  transaction data, no account numbers, no personal info)
- Users are identified by an anonymous session_id stored in a cookie — no login required
- Keep components simple and in as few files as possible

## The 5 modules
1. File Ingestor — reads CSV client-side, extracts Date, Amount, Description only
2. Categorization Engine — buckets transactions by merchant keyword
3. Award Calculator — evaluates 8 specific award rules
4. WhatsApp Formatter — generates a wa.me share URL with roast text
5. Trends Engine — reads past summaries from Supabase for the same session_id and shows month-over-month patterns

## Database — Supabase
Single table: quincena_results

Columns:
- id (auto)
- session_id (text) — see privacy model below
- uploaded_at (timestamp)
- month (text, format: "YYYY-MM", e.g. "2025-06")
- total_spent (numeric)
- top_category (text)
- awards_won (text array)
- transaction_count (integer)

## Privacy model — how session_id works
When a user visits the app for the first time, generate a random UUID
(e.g. "a3f8c2d1-9b4e-41c2-b8f0-3d7e9a1c5f2b") and store it in a
browser cookie. Use this UUID as the session_id for all their uploads.

Rules:
- Never ask for name, email, phone, or any personal information
- The session_id is a random string with no connection to any real identity
- We never store raw transactions, merchant names, or descriptions
- Only the aggregated summary (totals, categories, awards) is stored
- One row per session_id per month — if the same user uploads the same
  month twice, overwrite (upsert), don't duplicate

Limitation to be aware of: if the user clears their browser cookies or
switches devices, they get a new session_id and lose access to their
history. This is acceptable for MVP.

## Award logic (implement exactly as specified)
- Índice Godín: highest count in Convenience Store bucket (Oxxo, 7-Eleven)
- Accionista de Uber: highest total MXN in Ride-sharing bucket (Uber, DiDi)
- Banco Central: large negative transaction on Fri/Sat + 3 SPEI transfers within 48hrs
- Hoyo Negro de Efectivo: 4+ cash withdrawal transactions
- Socio Honorario SmartFit: gym subscription charge + high food delivery count
- Síndrome Me Lo Merezco: large charge on the 15th, 30th, or 31st
- Mártir de las Comisiones: any bank fee present

## CSV format notes
- Mexican banks (BBVA, Nu, Banamex) use varied formats
- Strip alphanumeric reference codes, focus on merchant name in description
- Amounts: negative = expense, positive = income/transfer received

## Trends logic
- If session_id has 2+ months of data in Supabase, show a trends section below the awards
- Bar chart of total_spent per month using recharts
- Highlight award categories won 2+ months in a row (e.g. "3 meses seguidos como Accionista de Uber 👀")
- If only 1 month exists, show a teaser: "Sube el mes que viene para ver si mejoraste 👀"
