// CSV parsing is fully client-side.
// PDF parsing extracts text client-side via pdf.js, then sends the raw text
// to /api/parse-pdf (server-side) where Claude extracts the transactions.

export interface Transaction {
  date: string;        // YYYY-MM-DD
  amount: number;      // negative = expense, positive = income
  description: string;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function normalizeDate(s: string): string | null {
  // DD/MM/YYYY or D/M/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function parseAmount(s: string): number {
  // Remove currency symbol, spaces, commas-as-thousands-separator
  return parseFloat(s.replace(/[$\s]/g, "").replace(/,/g, ""));
}

function cleanDesc(s: string): string {
  return s
    .replace(/\bREF\.?\s*:?\s*\S+/gi, "")  // REF:... or REF ...
    .replace(/\b\w*\d{6,}\w*\b/g, "")       // tokens with 6+ digits (reference codes)
    .replace(/[|*#_]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function tokenizeCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let inQ = false, cur = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if ((c === "," || c === ";") && !inQ) {
        fields.push(cur.trim()); cur = "";
      } else cur += c;
    }
    fields.push(cur.trim());
    rows.push(fields);
  }
  return rows;
}

export function parseCSV(text: string): Transaction[] {
  const rows = tokenizeCSV(text);
  if (rows.length < 2) return [];

  // Normalize header: lowercase, strip BOM
  const header = rows[0].map(h =>
    h.toLowerCase().replace(/^\uFEFF/, "").replace(/[^a-záéíóúüñ\s]/g, "")
  );

  const fi = (pats: string[]) =>
    header.findIndex(h => pats.some(p => h.includes(p)));

  const dateCol  = fi(["fecha", "date"]);
  const descCol  = fi(["concepto", "descripci", "description"]);
  const amtCol   = fi(["monto", "importe", "amount"]);
  const cargoCol = fi(["cargo"]);
  const abonoCol = fi(["abono"]);

  const isBBVA = cargoCol >= 0 && abonoCol >= 0;

  const txns: Transaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[dateCol]) continue;

    const date = normalizeDate(r[dateCol]);
    if (!date) continue;

    let amount: number;
    if (isBBVA) {
      const cargo = parseAmount(r[cargoCol] || "0") || 0;
      const abono = parseAmount(r[abonoCol] || "0") || 0;
      if (!cargo && !abono) continue;
      amount = abono > 0 ? abono : -cargo;
    } else {
      if (amtCol < 0) continue;
      amount = parseAmount(r[amtCol] || "");
      if (isNaN(amount)) continue;
    }

    const desc = descCol >= 0 ? r[descCol] : r[1] || "";
    txns.push({ date, amount, description: cleanDesc(desc) });
  }
  return txns;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

async function loadPdfJs(): Promise<any> {
  const w = window as any;
  if (w.pdfjsLib) return w.pdfjsLib;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      w.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(w.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Failed to load pdf.js from CDN"));
    document.head.appendChild(script);
  });
}

async function pdfToLines(file: File): Promise<string[]> {
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  const allLines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    type Chunk = { text: string; x: number; y: number };
    const chunks: Chunk[] = (content.items as any[])
      .filter(it => it.str?.trim())
      .map(it => ({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] }));

    if (!chunks.length) continue;

    // Sort top→bottom (PDF y-axis is inverted), then left→right within a line
    chunks.sort((a, b) => b.y - a.y || a.x - b.x);

    let lineY = chunks[0].y;
    let tokens = [chunks[0].text];

    for (let i = 1; i < chunks.length; i++) {
      if (Math.abs(chunks[i].y - lineY) <= 3) {
        tokens.push(chunks[i].text);
      } else {
        allLines.push(tokens.join(" ").trim());
        lineY = chunks[i].y;
        tokens = [chunks[i].text];
      }
    }
    allLines.push(tokens.join(" ").trim());
  }

  return allLines.filter(l => l.trim());
}

async function parsePDF(file: File): Promise<Transaction[]> {
  const lines = await pdfToLines(file);
  if (!lines.length) {
    console.warn("No text found in PDF — it may be a scanned image.");
    return [];
  }

  const rawText = lines.join("\n");
  console.log(`Extracted ${lines.length} lines from PDF, sending to Claude...`);

  const res = await fetch("/api/parse-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: rawText }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error: ${err.error ?? res.statusText}`);
  }

  const { transactions } = await res.json();
  return transactions as Transaction[];
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function parseFile(file: File): Promise<Transaction[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(parseCSV(e.target?.result as string ?? ""));
      reader.onerror = reject;
      reader.readAsText(file, "utf-8");
    });
  }

  if (name.endsWith(".pdf")) {
    return parsePDF(file);
  }

  throw new Error("Tipo de archivo no soportado. Sube un .csv o .pdf.");
}
