"use client";

import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/lib/supabase";
import { parseFile } from "@/lib/parser";
import { categorizeTransactions } from "@/lib/categorizer";
import type { Category } from "@/lib/categorizer";
import { calculateAwards } from "@/lib/awards";
import type { Award } from "@/lib/awards";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MES_ES = [
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre",
];
const MES_SHORT = [
  "ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic",
];

function getOrCreateSessionId(): string {
  const name = "session_id";
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  if (match) return decodeURIComponent(match[1]);
  const uuid = crypto.randomUUID();
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${name}=${uuid}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
  return uuid;
}

function getMostCommonMonth(txns: { date: string }[]): string {
  const counts = new Map<string, number>();
  for (const t of txns) {
    const ym = t.date.slice(0, 7);
    counts.set(ym, (counts.get(ym) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? new Date().toISOString().slice(0, 7);
}

function getTopCategory(txns: { category: string }[]): string {
  const counts = new Map<string, number>();
  for (const t of txns) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MES_ES[parseInt(m) - 1]} ${y}`;
}

function shortMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MES_SHORT[parseInt(m) - 1]} ${y.slice(2)}`;
}

const ALL_CATEGORIES: Category[] = [
  "convenience_store", "rideshare", "food_delivery", "restaurant_cafe",
  "supermarket", "cash_withdrawal", "subscription_gym", "ecommerce",
  "pharmacy_health", "spei_transfer", "bank_fee", "gas_transport",
  "education", "other",
];

function getCategoryTotals(txns: { category: string; amount: number }[]): Record<string, number> {
  const totals: Record<string, number> = Object.fromEntries(ALL_CATEGORIES.map(c => [c, 0]));
  for (const t of txns) {
    if (t.amount < 0) totals[t.category] = (totals[t.category] ?? 0) + Math.abs(t.amount);
  }
  return totals;
}

// Award metadata for trends callouts (id → display info)
const AWARD_META: Record<string, { emoji: string; title: string }> = {
  indice_godin:             { emoji: "🏪", title: "Índice Godín" },
  accionista_uber:          { emoji: "🚗", title: "Accionista de Uber" },
  banco_central:            { emoji: "🏦", title: "Banco Central" },
  hoyo_negro_efectivo:      { emoji: "💸", title: "Hoyo Negro de Efectivo" },
  socio_honorario_smartfit: { emoji: "🏋️", title: "Socio Honorario SmartFit" },
  sindrome_me_lo_merezco:   { emoji: "🛍️", title: "Síndrome 'Me Lo Merezco'" },
  martir_comisiones:        { emoji: "😤", title: "Mártir de las Comisiones" },
  sobreviviente_extremo:    { emoji: "🧗", title: "Sobreviviente Extremo" },
};

// Returns true if monthB is exactly one calendar month after monthA
function isNextMonth(a: string, b: string): boolean {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (am < 12 && bm === am + 1 && by === ay) || (am === 12 && bm === 1 && by === ay + 1);
}

interface HistoryRow {
  month: string;
  total_spent: number;
  awards_won: string[];
}

// Finds award streaks that include the most recent month (ongoing streaks only)
function findCurrentStreaks(history: HistoryRow[]): { awardId: string; count: number }[] {
  if (history.length < 2) return [];
  const allIds = [...new Set(history.flatMap(r => r.awards_won ?? []))];
  const streaks: { awardId: string; count: number }[] = [];

  for (const id of allIds) {
    let count = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const won = history[i].awards_won?.includes(id);
      if (!won) break;
      if (i < history.length - 1 && !isNextMonth(history[i].month, history[i + 1].month)) break;
      count++;
    }
    if (count >= 2) streaks.push({ awardId: id, count });
  }

  return streaks.sort((a, b) => b.count - a.count);
}

function buildWhatsAppUrl(awards: Award[], month: string): string {
  const top = awards.slice(0, 4);
  const lines = [
    `🏆 *Mis Premios de la Quincena — ${formatMonth(month)}*`,
    "",
    ...top.flatMap(a => [`${a.emoji} *${a.title}*`, a.roast_text, ""]),
    "¿Y tú cuántos ganaste? 👀",
  ];
  return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Results {
  awards: Award[];
  month: string;
  history: HistoryRow[];
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("session_id:", getOrCreateSessionId());
  }, []);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const txns = await parseFile(file);
      if (!txns.length)
        throw new Error("No se encontraron transacciones. Verifica el formato del archivo.");

      const categorized = categorizeTransactions(txns);
      const awards = calculateAwards(categorized);
      const month = getMostCommonMonth(txns);
      const sessionId = getOrCreateSessionId();
      const total_spent = txns
        .filter(t => t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0);

      console.log(`🏆 ${awards.length} premios:`, awards.map(a => a.id));

      // Await upsert so the current month is included when we query history next
      const { error: upsertErr } = await supabase
        .from("quincena_results")
        .upsert(
          {
            session_id: sessionId,
            month,
            total_spent,
            top_category: getTopCategory(categorized),
            awards_won: awards.map(a => a.id),
            transaction_count: categorized.length,
            category_totals: getCategoryTotals(categorized),
          },
          { onConflict: "session_id,month" }
        );

      if (upsertErr) console.error("Supabase upsert error:", upsertErr.message);
      else console.log(`✅ Guardado en Supabase — ${month}`);

      // Query full history for this session
      const { data: historyData } = await supabase
        .from("quincena_results")
        .select("month, total_spent, awards_won")
        .eq("session_id", sessionId)
        .order("month", { ascending: true });

      const history = (historyData ?? []) as HistoryRow[];

      setResults({ awards, month, history });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar el archivo.");
    } finally {
      setLoading(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-6xl animate-bounce mb-4">🔍</div>
          <p className="text-xl font-bold text-amber-900">Analizando tus gastos...</p>
          <p className="text-amber-700 mt-2 text-sm">Contando tus Oxxos, un momento</p>
        </div>
      </main>
    );
  }

  // ── Results ──────────────────────────────────────────────────────────────────
  if (results) {
    const { awards, month, history } = results;
    const whatsappUrl = awards.length > 0 ? buildWhatsAppUrl(awards, month) : null;
    const hasHistory = history.length >= 2;
    const streaks = hasHistory ? findCurrentStreaks(history) : [];
    const chartData = history.map(r => ({
      label: shortMonth(r.month),
      gastado: Math.round(r.total_spent),
    }));

    return (
      <main className="min-h-screen bg-amber-50 px-4 py-10">
        <div className="max-w-md mx-auto flex flex-col gap-5">

          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-amber-900">Tus Premios 🏆</h1>
            <p className="text-amber-600 mt-1 capitalize">{formatMonth(month)}</p>
          </div>

          {awards.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-amber-100 shadow">
              <div className="text-5xl mb-3">👏</div>
              <p className="font-bold text-amber-900 text-lg">¡Mes limpio!</p>
              <p className="text-amber-700 text-sm mt-2">
                No ganaste ningún premio esta quincena.
                O eres muy responsable, o no pusiste tu estado de cuenta completo.
              </p>
            </div>
          ) : (
            awards.slice(0, 4).map(award => (
              <div key={award.id} className="bg-white rounded-2xl shadow p-5 border border-amber-100">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-4xl leading-none">{award.emoji}</span>
                  <h3 className="text-lg font-bold text-amber-900 leading-tight">{award.title}</h3>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{award.roast_text}</p>
              </div>
            ))
          )}

          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold text-lg py-4 px-6 rounded-2xl shadow-md transition-colors text-center block"
            >
              📲 Compartir en WhatsApp
            </a>
          )}

          {/* ── Trends ── */}
          <div className="bg-white rounded-2xl shadow p-5 border border-amber-100">
            <h2 className="text-lg font-bold text-amber-900 mb-3">Tendencias 📈</h2>

            {hasHistory ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#92400e" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                      tick={{ fontSize: 10, fill: "#92400e" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [
                        v != null ? `$${v.toLocaleString("es-MX")}` : "",
                        "Gastado",
                      ]}
                      contentStyle={{ borderRadius: 12, fontSize: 13 }}
                    />
                    <Bar dataKey="gastado" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                {streaks.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    {streaks.map(s => {
                      const meta = AWARD_META[s.awardId];
                      if (!meta) return null;
                      return (
                        <p
                          key={s.awardId}
                          className="text-sm bg-amber-50 rounded-xl px-4 py-2 text-amber-900"
                        >
                          {meta.emoji}{" "}
                          <strong>{s.count} meses seguidos</strong> como {meta.title} 👀
                        </p>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-amber-700 text-center py-2">
                Sube el mes que viene para ver si mejoraste... o empeoraste 👀
              </p>
            )}
          </div>

          <button
            onClick={() => { setResults(null); setError(null); }}
            className="text-amber-700 underline text-sm text-center"
          >
            Analizar otro mes
          </button>

        </div>
      </main>
    );
  }

  // ── Landing ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-amber-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">

        <h1 className="text-4xl font-extrabold text-amber-900 leading-tight">
          Premios de la Quincena 🏆
        </h1>

        <p className="text-lg text-amber-800">
          Sube tu estado de cuenta y descubre en qué categoría de gastador irresponsable quedaste este mes.
        </p>

        {error && (
          <p className="w-full text-red-700 bg-red-50 rounded-xl px-4 py-3 text-sm">
            ⚠️ {error}
          </p>
        )}

        <button
          onClick={() => inputRef.current?.click()}
          className="w-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-lg py-4 px-6 rounded-2xl shadow-md transition-colors"
        >
          Subir estado de cuenta (.csv o .pdf)
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.pdf"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await handleFile(file);
            e.target.value = "";
          }}
        />

        <p className="text-sm text-amber-700 bg-amber-100 rounded-xl px-4 py-3 leading-relaxed">
          🔒 Tu archivo se procesa con IA — nunca guardamos tus transacciones.
        </p>

      </div>
    </main>
  );
}
