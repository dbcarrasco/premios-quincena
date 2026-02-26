import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Premios de la Quincena 🏆",
  description: "Descubre en qué categoría de gastador irresponsable quedaste este mes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
