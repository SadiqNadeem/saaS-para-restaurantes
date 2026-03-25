import "../styles/globals.css";

export const metadata = {
  title: "SaaS Restaurant",
  description: "Next.js + Supabase deployment base",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
