import { supabase } from "../lib/supabaseClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { error } = await supabase.from("restaurants").select("id").limit(1);

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <section className="mx-auto max-w-3xl rounded border border-gray-200 bg-white p-5">
        <h1 className="text-lg font-semibold text-gray-900">SaaS listo para Vercel</h1>
        <p className="mt-2 text-sm text-gray-700">
          Entorno de Next.js configurado con Supabase via variables NEXT_PUBLIC.
        </p>
        <p className="mt-2 text-sm text-gray-700">
          Estado conexion Supabase: {error ? "error" : "ok"}
        </p>
      </section>
    </main>
  );
}
