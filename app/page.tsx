"use client";

import { useEffect, useRef } from "react";

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

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    console.log("session_id:", sessionId);
  }, []);

  return (
    <main className="min-h-screen bg-amber-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">

        <h1 className="text-4xl font-extrabold text-amber-900 leading-tight">
          Premios de la Quincena 🏆
        </h1>

        <p className="text-lg text-amber-800">
          Sube tu estado de cuenta y descubre en qué categoría de gastador irresponsable quedaste este mes.
        </p>

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
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) console.log("Archivo seleccionado:", file.name);
          }}
        />

        <p className="text-sm text-amber-700 bg-amber-100 rounded-xl px-4 py-3 leading-relaxed">
          🔒 Tus movimientos <strong>nunca salen de tu celular</strong> — solo se guarda un resumen anónimo para mostrarte cómo evolucionan tus malos hábitos mes a mes.
        </p>

      </div>
    </main>
  );
}
