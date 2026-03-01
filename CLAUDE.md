# Premios de la Quincena

A humorous Mexican web app where users upload their bank statement (CSV or PDF)
and receive a roast of their spending habits, formatted as a shareable WhatsApp
message. Repeat users can see how their bad habits evolve month over month.

## Stack
- Next.js 16 (App Router) + TypeScript
- Tailwind CSS for styling
- Supabase for database (anonymous session tracking + monthly summaries)
- Anthropic Claude API (claude-sonnet-4-6) for PDF transaction extraction
- recharts for bar chart in trends section
- Deployed to Vercel

## Key rules
- Mobile-first design, it will mostly be used on phones
- Spanish language throughout, Mexican tone — casual, funny, not formal
- CSV parsing is fully client-side — raw transactions never leave the browser
- PDF parsing: text is extracted client-side via pdf.js (CDN), then sent to
  the /api/parse-pdf route which calls Claude to extract transactions
- Only aggregated, anonymized summaries are stored in Supabase (no raw
  transaction data, no account numbers, no personal info)
- Users are identified by an anonymous session_id stored in a cookie — no login required
- Keep components simple and in as few files as possible

## File structure
```
app/
  page.tsx              — entire UI (landing, loading, results, trends)
  api/parse-pdf/
    route.ts            — server route: receives PDF text, calls Claude API
  globals.css
  layout.tsx
lib/
  parser.ts             — CSV + PDF file parsing → Transaction[]
  categorizer.ts        — keyword matching → CategorizedTransaction[]
  awards.ts             — 8 award rules → Award[]
  supabase.ts           — Supabase client singleton
```

## Module call order (in page.tsx handleFile)
```
parseFile(file)                → Transaction[]           lib/parser.ts
categorizeTransactions(txns)   → CategorizedTransaction[] lib/categorizer.ts
calculateAwards(categorized)   → Award[]                 lib/awards.ts
supabase upsert (await)        → saves summary row
supabase select                → loads full history for trends
```

## Database — Supabase
Single table: `quincena_results`

Columns:
- id (uuid, primary key, auto)
- session_id (text, not null)
- uploaded_at (timestamptz, default now())
- month (text, format: "YYYY-MM") — unique per session_id
- total_spent (numeric)
- top_category (text)
- awards_won (text[])
- transaction_count (integer)
- category_totals (jsonb) — total MXN spent per category, all 14 keys always present

Unique constraint on (session_id, month) — upsert on conflict, no duplicates.

SQL to create table:
```sql
create table quincena_results (
  id                uuid primary key default gen_random_uuid(),
  session_id        text not null,
  uploaded_at       timestamptz not null default now(),
  month             text not null,
  total_spent       numeric,
  top_category      text,
  awards_won        text[],
  transaction_count integer,
  category_totals   jsonb,
  unique (session_id, month)
);
```

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon/public key
ANTHROPIC_API_KEY=              # Anthropic API key (server-side only)
```

## Privacy model — how session_id works
On first visit, generate a random UUID and store in a browser cookie named
`session_id` with a 1-year expiry. Use this UUID as the session_id for all uploads.

Rules:
- Never ask for name, email, phone, or any personal information
- The session_id is a random UUID with no connection to any real identity
- Raw transactions are never stored — only the aggregated summary
- One row per session_id per month — uploading the same month twice overwrites

Limitation: if the user clears cookies or switches devices, they get a new
session_id and lose history access. Acceptable for MVP.

## Parser (lib/parser.ts)
**CSV**: FileReader reads client-side. Auto-detects bank format by headers:
- BBVA: `Cargo` + `Abono` columns (separate debit/credit)
- Nu: `date` + `amount` columns
- Banamex: `Fecha` + `Monto` columns

**PDF**: pdf.js (cdnjs, 3.11.174) extracts text client-side, grouped by
y-coordinate into lines. Raw text is POSTed to `/api/parse-pdf`, which calls
Claude to return a clean JSON transaction array.

Output format: `{ date: "YYYY-MM-DD", amount: number, description: string }`
Negative amount = expense, positive = income/transfer received.

## Categorizer (lib/categorizer.ts)
Keyword matching, case-insensitive. Priority order (first match wins):
1. food_delivery (catches "uber eats" before rideshare catches "uber")
2. rideshare (skipped if description contains "eats", "food", or "rappi")
3. bank_fee
4. cash_withdrawal
5. spei_transfer
6. subscription_gym
7. gas_transport (before convenience_store so "oxxo gas" beats "oxxo")
8. convenience_store (before pharmacy_health so "farmacias guadalajara" beats "farmacia")
9. restaurant_cafe
10. supermarket
11. pharmacy_health
12. ecommerce
13. education
14. other

Keyword syntax:
- `*` = wildcard (e.g. `"uber*eats"` matches "UBER*EATS12345")
- `^` prefix = must match at start of description (e.g. `"^rest "` won't match "interest")

## Awards (lib/awards.ts)
Each award: `{ id, title, emoji, roast_text, trigger_value }`
Sorted descending by trigger_value (higher = stronger signal = appears first).
Returns only triggered awards (0–8 per upload).

1. **indice_godin** 🏪 — 2+ convenience_store transactions
2. **accionista_uber** 🚗 — rideshare total ≥ $200 MXN
3. **banco_central** 🏦 — negative txn > $1,000 on Fri/Sat + 3+ incoming SPEI within 48h
4. **hoyo_negro_efectivo** 💸 — 4+ cash_withdrawal transactions
5. **socio_honorario_smartfit** 🏋️ — 1+ subscription_gym AND 5+ food_delivery
6. **sindrome_me_lo_merezco** 🛍️ — ecommerce > $500 on the 15th, 30th, or 31st
7. **martir_comisiones** 😤 — any bank_fee transaction present
8. **sobreviviente_extremo** 🧗 — running balance < $50 on any day 13, 14, 28, or 29

Roast texts use actual numbers from the user's data. Generic roasts are not acceptable.

## Trends (in page.tsx results view)
- After upsert, queries all rows for the session_id ordered by month
- 2+ months → recharts BarChart of total_spent per month + streak callouts
- 1 month → teaser: "Sube el mes que viene para ver si mejoraste... o empeoraste 👀"
- Streak = award won in consecutive calendar months ending with the most recent upload
- Callout format: "🚗 3 meses seguidos como Accionista de Uber 👀"

## WhatsApp share
`wa.me/?text=` URL with top 4 awards formatted as WhatsApp markdown
(*bold* for titles, plain text for roast). No app URL included yet.
