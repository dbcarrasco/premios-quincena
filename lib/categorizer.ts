import { Transaction } from "./parser";

export type Category =
  | "convenience_store"
  | "rideshare"
  | "food_delivery"
  | "restaurant_cafe"
  | "supermarket"
  | "cash_withdrawal"
  | "subscription_gym"
  | "ecommerce"
  | "pharmacy_health"
  | "spei_transfer"
  | "bank_fee"
  | "gas_transport"
  | "education"
  | "other";

export interface CategorizedTransaction extends Transaction {
  category: Category;
}

// ─── Keyword lists ────────────────────────────────────────────────────────────
// Special prefixes in keywords:
//   *  → wildcard (e.g. "uber*eats" matches "uber eats", "uber*eats12345")
//   ^  → must match at START of description (e.g. "^rest " won't match "interest")

const KEYWORDS: Record<Exclude<Category, "other">, string[]> = {
  food_delivery: [
    "uber eats", "ubereats", "uber*eats", "ubreats",
    "rappi",
    "didi food", "didifood", "didi*food",
    "sin delantal", "justo", "cornershop",
  ],

  // Rideshare: checked AFTER food_delivery. Excluded if desc contains "eats", "food", "rappi".
  rideshare: [
    "uber", "didi", "cabify", "beat", "in driver", "indriver",
  ],

  bank_fee: [
    "comision", "anualidad", "cargo por", "iva comision",
    "interes", "penalizacion", "cargo mensual", "mantenimiento",
    "cobro automatico seguro",
  ],

  cash_withdrawal: [
    "retiro", "cajero", "atm", "disposicion", "efectivo",
    "banamex atm", "hsbc atm", "bbva atm", "santander atm", "scotiabank atm",
  ],

  spei_transfer: [
    "spei", "transferencia", "traspaso", "envio", "pago a",
    "codi", "codi pago",
    "mercadopago", "mercado pago", "clip", "conekta",
  ],

  subscription_gym: [
    "smartfit", "sport city", "sportcity", "gym", "gimnasio",
    "netflix", "spotify", "disney+", "disney", "hbo max", "hbo",
    "apple", "google", "microsoft", "amazon prime", "paramount",
    "openai", "chatgpt", "claude", "dropbox", "icloud", "youtube premium",
    "zoom", "slack", "notion", "duolingo", "crunchyroll", "twitch",
    "plata+", "suscripcion plata", "storytel", "dochub",
  ],

  // gas_transport before convenience_store so "oxxo gas" beats "oxxo"
  gas_transport: [
    "gasolineria", "gasolinera", "gasolina", "oxxo gas",
    "estacion de servicio", "estacion de gas", "estacion ",
    "^est ",
    "pemex", "bp", "shell", "mobil",
    "metro", "metrobus", "trolebus", "ecobici", "tren",
    "gas",
  ],

  // convenience_store before pharmacy_health so "farmacias guadalajara" beats "farmacia"
  convenience_store: [
    "oxxo", "7-eleven", "seven eleven", "7eleven", "7 eleven",
    "circle k", "circlek", "six", "extra", "kiosko",
    "farmacias guadalajara", "farmacia guadalajara",
    "chedraui", "bodega aurrera", "aurrera", "walmart express",
    "walmartexpress", "seven 11",
    "mini super", "minisuper", "super peche", "abarrotes", "miscelanea",
  ],

  // restaurant_cafe before supermarket (per spec)
  restaurant_cafe: [
    "koi", "cafe", "coffee", "starbucks",
    "restaurant", "restaurante", "^rest ",
    "taco", "tacos", "sushi", "pizza", "burger", "hamburguesa",
    "subway", "kfc", "mcdonalds", "dominos", "vips", "sanborns",
    "el pescador", "la nacional", "cielito querido", "punta del cielo",
    "proscenio", "joselo", "yangguofu", "granola",
  ],

  supermarket: [
    "walmart", "sams club", "sam's", "costco", "soriana",
    "chedraui", "la comer", "city market", "fresko", "superama",
    "heb", "selecto", "mega", "comercial mexicana",
  ],

  pharmacy_health: [
    "farmacia", "farmacias", "similares", "farmacia del ahorro",
    "benavides", "cruz verde", "san pablo", "farmacias san pablo",
    "^dr ", "doctor ", "dra ",
    "hospital", "clinica", "laboratorio", "dentista", "optica",
  ],

  ecommerce: [
    "amazon", "mercado libre", "mercadolibre", "meli", "shein",
    "aliexpress", "liverpool", "palacio de hierro", "zara",
    "h&m", "pull and bear", "bershka", "privalia", "linio",
    "wish", "ebay", "paypal",
    "office depot", "officedepot", "fedex", "staples",
  ],

  education: [
    "colegio", "escuela", "universidad", "inscripcion",
    "colegiatura", "coursera", "udemy", "platzi",
  ],
};

// Priority order: more specific categories first
const PRIORITY: Exclude<Category, "other">[] = [
  "food_delivery",
  "rideshare",
  "bank_fee",
  "cash_withdrawal",
  "spei_transfer",
  "subscription_gym",
  "gas_transport",
  "convenience_store",
  "restaurant_cafe",
  "supermarket",
  "pharmacy_health",
  "ecommerce",
  "education",
];

// ─── Matching logic ───────────────────────────────────────────────────────────

function kwMatches(desc: string, kw: string): boolean {
  const anchored = kw.startsWith("^");
  const base = anchored ? kw.slice(1) : kw;

  if (base.includes("*")) {
    const escaped = base.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const pattern = (anchored ? "^" : "") + escaped.replace(/\*/g, ".*");
    return new RegExp(pattern).test(desc);
  }

  if (anchored) return desc.startsWith(base);
  return desc.includes(base);
}

function categorize(description: string): Category {
  const d = description.toLowerCase();

  for (const cat of PRIORITY) {
    // Rideshare exclusion: skip if description looks food-related
    if (cat === "rideshare" && (d.includes("eats") || d.includes("food") || d.includes("rappi"))) {
      continue;
    }
    if (KEYWORDS[cat].some(kw => kwMatches(d, kw))) {
      return cat;
    }
  }

  return "other";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function categorizeTransactions(txns: Transaction[]): CategorizedTransaction[] {
  return txns.map(t => ({ ...t, category: categorize(t.description) }));
}

export function logCategorySummary(txns: CategorizedTransaction[]): void {
  const counts: Partial<Record<Category, number>> = {};
  for (const t of txns) {
    counts[t.category] = (counts[t.category] ?? 0) + 1;
  }
  console.log("📊 Conteo por categoría:", counts);

  const others = txns.filter(t => t.category === "other");
  if (others.length) {
    console.log(`❓ Sin categoría (${others.length}):`, others.map(t => t.description));
  } else {
    console.log("✅ Todas las transacciones fueron categorizadas.");
  }
}
