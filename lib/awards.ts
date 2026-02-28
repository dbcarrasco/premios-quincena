import { CategorizedTransaction } from "./categorizer";

export interface Award {
  id: string;
  title: string;
  emoji: string;
  roast_text: string;
  trigger_value: number; // higher = stronger signal = appears first
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MES = [
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre",
];

/** Format as "$1,234" (no decimals, Mexican locale) */
function mxn(n: number): string {
  return "$" + Math.round(Math.abs(n)).toLocaleString("es-MX");
}

/** Day of month (1–31) from YYYY-MM-DD */
function dom(dateStr: string): number {
  return parseInt(dateStr.slice(8), 10);
}

/** Day of week (0=Sun … 5=Fri, 6=Sat) from YYYY-MM-DD */
function dow(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Days from dateA to dateB (positive = B is after A) */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86400000
  );
}

/** Advance a YYYY-MM-DD date by one day */
function nextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Human-readable date: "7 de junio" */
function humanDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(d)} de ${MES[parseInt(m) - 1]}`;
}

// ─── Award evaluators ─────────────────────────────────────────────────────────

function indiceGodin(txns: CategorizedTransaction[]): Award | null {
  const list = txns.filter(t => t.category === "convenience_store" && t.amount < 0);
  if (list.length < 2) return null;

  const total = list.reduce((s, t) => s + Math.abs(t.amount), 0);
  const hasOxxo = list.some(t => t.description.toLowerCase().includes("oxxo"));
  const storeName = hasOxxo ? "el Oxxo" : "la tiendita de conveniencia";

  return {
    id: "indice_godin",
    title: "Índice Godín",
    emoji: "🏪",
    roast_text:
      `Fuiste ${list.length} veces a ${storeName} este mes — ${mxn(total)} en total. ` +
      `Literalmente estás financiando la remodelación de la sucursal más cercana a tu chamba. ` +
      `¿El súper existe o sólo lo visitas en teoría?`,
    trigger_value: list.length,
  };
}

function accionistaUber(txns: CategorizedTransaction[]): Award | null {
  const list = txns.filter(t => t.category === "rideshare" && t.amount < 0);
  const total = list.reduce((s, t) => s + Math.abs(t.amount), 0);
  if (total < 200) return null;

  const avgTrip = list.length ? Math.round(total / list.length) : 0;

  return {
    id: "accionista_uber",
    title: "Accionista de Uber",
    emoji: "🚗",
    roast_text:
      `${mxn(total)} en Uber y DiDi este mes, ${list.length} viajes — promedio ${mxn(avgTrip)} cada uno. ` +
      `Con eso ya ibas mereciendo dividendos trimestrales. ` +
      `¿Tus piernas son de adorno o tienen algún plan de negocio propio?`,
    trigger_value: total,
  };
}

function bancoCentral(txns: CategorizedTransaction[]): Award | null {
  const bigWeekend = txns.filter(
    t => t.amount < -1000 && (dow(t.date) === 5 || dow(t.date) === 6)
  );

  for (const trigger of bigWeekend) {
    const incoming = txns.filter(
      t =>
        t.category === "spei_transfer" &&
        t.amount > 0 &&
        daysBetween(trigger.date, t.date) >= 0 &&
        daysBetween(trigger.date, t.date) <= 2
    );
    if (incoming.length < 3) continue;

    const dayName = dow(trigger.date) === 5 ? "viernes" : "sábado";
    const inTotal = incoming.reduce((s, t) => s + t.amount, 0);

    return {
      id: "banco_central",
      title: "Banco Central",
      emoji: "🏦",
      roast_text:
        `El ${dayName} ${humanDate(trigger.date)} soltaste ${mxn(trigger.amount)} de un solo golpe, ` +
        `y en las siguientes 48 horas te cayeron ${incoming.length} transferencias por ${mxn(inTotal)}. ` +
        `Eres el banco central del grupo, mano. Tasa de interés: amistad. Sin garantías.`,
      trigger_value: Math.abs(trigger.amount),
    };
  }
  return null;
}

function hoyoNegroEfectivo(txns: CategorizedTransaction[]): Award | null {
  const list = txns.filter(t => t.category === "cash_withdrawal" && t.amount < 0);
  if (list.length < 4) return null;

  const total = list.reduce((s, t) => s + Math.abs(t.amount), 0);

  return {
    id: "hoyo_negro_efectivo",
    title: "Hoyo Negro de Efectivo",
    emoji: "💸",
    roast_text:
      `${list.length} retiros de cajero este mes — ${mxn(total)} en total. ` +
      `El efectivo entra al bolsillo y desaparece como lágrimas en la lluvia: nadie sabe en qué se fue. ` +
      `¿El casero, la vaca, o simplemente "gastos varios"?`,
    trigger_value: list.length,
  };
}

function socioSmartfit(txns: CategorizedTransaction[]): Award | null {
  const gym = txns.filter(t => t.category === "subscription_gym");
  const delivery = txns.filter(t => t.category === "food_delivery" && t.amount < 0);
  if (gym.length < 1 || delivery.length < 5) return null;

  const gymTotal = gym.reduce((s, t) => s + Math.abs(t.amount), 0);
  const delivTotal = delivery.reduce((s, t) => s + Math.abs(t.amount), 0);

  return {
    id: "socio_honorario_smartfit",
    title: "Socio Honorario SmartFit",
    emoji: "🏋️",
    roast_text:
      `Pagaste ${mxn(gymTotal)} de gym y luego pediste delivery ${delivery.length} veces (${mxn(delivTotal)}). ` +
      `La membresía claramente existe para compensar el karma del Uber Eats. ` +
      `Todos lo hacemos. Nadie te juzga. Bueno, sí, un poco.`,
    trigger_value: delivery.length,
  };
}

function sindromeMeLoMerezco(txns: CategorizedTransaction[]): Award | null {
  const qualifying = txns.filter(
    t => t.category === "ecommerce" && t.amount < -500 && [15, 30, 31].includes(dom(t.date))
  );
  if (!qualifying.length) return null;

  const biggest = qualifying.reduce((max, t) => (t.amount < max.amount ? t : max));
  const day = dom(biggest.date);
  const zona = day === 15 ? "justo en quincena" : "con el último depósito del mes";

  return {
    id: "sindrome_me_lo_merezco",
    title: "Síndrome 'Me Lo Merezco'",
    emoji: "🛍️",
    roast_text:
      `El ${humanDate(biggest.date)} (${zona}) te aventaste ${mxn(biggest.amount)} en ${biggest.description}. ` +
      `Llegó el dinero, se fue la razón — en ese orden. ` +
      `¿A poco no te lo mereces? (La respuesta correcta es no, pero ya fue.)`,
    trigger_value: Math.abs(biggest.amount),
  };
}

function martirComisiones(txns: CategorizedTransaction[]): Award | null {
  const fees = txns.filter(t => t.category === "bank_fee" && t.amount < 0);
  if (!fees.length) return null;

  const total = fees.reduce((s, t) => s + Math.abs(t.amount), 0);
  const plural = fees.length > 1 ? ` En ${fees.length} cargos distintos, para más inri.` : "";

  return {
    id: "martir_comisiones",
    title: "Mártir de las Comisiones",
    emoji: "😤",
    roast_text:
      `Tu banco te cobró ${mxn(total)} en comisiones este mes.${plural} ` +
      `Te están cobrando el privilegio de guardarles tu propio dinero. ` +
      `Ya existen Nu, Spin y mil opciones sin comisiones — solo diciéndote.`,
    trigger_value: total,
  };
}

function sobrevivienteExtremo(txns: CategorizedTransaction[]): Award | null {
  if (!txns.length) return null;

  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));

  // Accumulate net per date
  const netByDate = new Map<string, number>();
  for (const t of sorted) {
    netByDate.set(t.date, (netByDate.get(t.date) ?? 0) + t.amount);
  }

  const firstDate = sorted[0].date;
  const lastDate = sorted[sorted.length - 1].date;

  let running = 0;
  let lowestBalance: number | null = null;
  let lowestDate: string | null = null;
  let current = firstDate;

  while (current <= lastDate) {
    running += netByDate.get(current) ?? 0;
    const day = dom(current);
    if ([13, 14, 28, 29].includes(day) && running < 50) {
      if (lowestBalance === null || running < lowestBalance) {
        lowestBalance = running;
        lowestDate = current;
      }
    }
    current = nextDay(current);
  }

  if (lowestBalance === null || lowestDate === null) return null;

  const day = dom(lowestDate);
  const zona = day <= 14 ? "antes de la quincena" : "antes de fin de mes";
  const balStr =
    lowestBalance < 0
      ? `−${mxn(lowestBalance)} (sí, en números rojos)`
      : `${mxn(lowestBalance)} pesitos`;

  return {
    id: "sobreviviente_extremo",
    title: "Sobreviviente Extremo",
    emoji: "🧗",
    roast_text:
      `El ${humanDate(lowestDate)} (${zona}) tu saldo llegó a ${balStr}. ` +
      `Modo supervivencia activado: WiFi del vecino, tacos de nada y fe ciega en que el jueves cae el depósito. ` +
      `Sobreviviste. Eres un héroe. Un héroe irresponsable, pero héroe.`,
    // Distance below $50 → bigger = more extreme = sorts higher
    trigger_value: Math.max(0, 50 - lowestBalance),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

const EVALUATORS = [
  indiceGodin,
  accionistaUber,
  bancoCentral,
  hoyoNegroEfectivo,
  socioSmartfit,
  sindromeMeLoMerezco,
  martirComisiones,
  sobrevivienteExtremo,
];

export function calculateAwards(txns: CategorizedTransaction[]): Award[] {
  return EVALUATORS
    .map(fn => fn(txns))
    .filter((a): a is Award => a !== null)
    .sort((a, b) => b.trigger_value - a.trigger_value);
}

export function logAwards(awards: Award[]): void {
  if (!awards.length) {
    console.log("🏆 Ningún premio ganado — este mes fuiste responsable (o mintiéndote a ti mismo).");
    return;
  }
  console.log(`🏆 ${awards.length} premio(s) ganado(s):`);
  for (const a of awards) {
    console.log(`  ${a.emoji} [${a.id}] trigger_value: ${a.trigger_value}`);
    console.log(`     ${a.roast_text}`);
  }
}
