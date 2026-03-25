import { useEffect, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

// Fake live-orders cycling in the mockup
const liveOrders = [
  { id: "#1045", item: "Kebab mixto + patatas", channel: "Online", status: "Nuevo", statusClass: "bg-blue-50 text-blue-600 border-blue-100" },
  { id: "#1044", item: "Menú shawarma pollo", channel: "QR Mesa 3", status: "Preparando", statusClass: "bg-orange-50 text-orange-600 border-orange-100" },
  { id: "#1043", item: "Falafel wrap + refresco", channel: "TPV", status: "Listo", statusClass: "bg-purple-50 text-purple-600 border-purple-100" },
  { id: "#1042", item: "Kebab + patatas", channel: "Online", status: "Entregado", statusClass: "bg-green-50 text-green-600 border-green-100" },
];

const HeroSection = () => {
  const [activeOrder, setActiveOrder] = useState(0);
  const [orderVisible, setOrderVisible] = useState(true);
  const ordersCount = useCountUp(3847, 1800, true);

  // Cycle through fake orders every 2.5s
  useEffect(() => {
    const interval = setInterval(() => {
      setOrderVisible(false);
      setTimeout(() => {
        setActiveOrder((prev) => (prev + 1) % liveOrders.length);
        setOrderVisible(true);
      }, 300);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const trustItems = [
    "Sin comisiones por pedido",
    "Configuración incluida",
    "Soporte en español",
  ];

  return (
    <section className="relative bg-white pt-28 pb-20 lg:pt-36 lg:pb-28 overflow-hidden">
      {/* Right-side background panel */}
      <div
        className="absolute top-0 right-0 w-[45%] h-full pointer-events-none hidden lg:block"
        style={{
          background: "#F5F7FB",
          clipPath: "polygon(8% 0%, 100% 0%, 100% 100%, 0% 100%)",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* ── Left: Copy ── */}
          <div>
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 bg-blue-50 text-[#1E3A8A] text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-blue-100 opacity-0-init animate-slide-in-left"
              style={{ animationDelay: "0ms" }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping-ring absolute inline-flex h-full w-full rounded-full bg-[#1E3A8A] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1E3A8A]" />
              </span>
              TPV · Pedidos online · Gestión de cocina
            </div>

            {/* Headline */}
            <h1
              className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold text-[#0B1E3A] leading-[1.15] tracking-tight opacity-0-init animate-slide-in-left"
              style={{ animationDelay: "80ms" }}
            >
              Consigue más pedidos en tu restaurante{" "}
              <span className="text-[#1E3A8A]">sin pagar comisiones</span>
            </h1>

            {/* Subtext */}
            <p
              className="mt-6 text-lg text-gray-500 max-w-lg leading-relaxed opacity-0-init animate-slide-in-left"
              style={{ animationDelay: "160ms" }}
            >
              Web de pedidos online, TPV, pantalla de cocina y repartos en un solo sistema. Sin cuotas por pedido. Sin permanencia.
            </p>

            {/* Buttons */}
            <div
              className="mt-8 flex flex-col sm:flex-row gap-3 opacity-0-init animate-slide-in-left"
              style={{ animationDelay: "240ms" }}
            >
              <a
                href="#demo"
                className="btn-shimmer inline-flex items-center justify-center gap-2 text-white font-semibold px-6 py-3 rounded-lg"
              >
                Ver demo <ArrowRight size={18} />
              </a>
              <a
                href="https://wa.me/34600000000"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-white border-2 border-gray-200 text-[#0B1E3A] font-semibold px-6 py-3 rounded-lg transition-all duration-200 hover:border-[#1E3A8A] hover:shadow-md hover:-translate-y-0.5"
              >
                <MessageCircle size={18} className="text-green-500" />
                Hablar por WhatsApp
              </a>
            </div>

            {/* Trust strip */}
            <div
              className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 opacity-0-init animate-slide-in-left"
              style={{ animationDelay: "320ms" }}
            >
              {trustItems.map((item) => (
                <span key={item} className="flex items-center gap-1.5 text-sm text-gray-500">
                  <svg className="w-4 h-4 text-[#1E3A8A] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* ── Right: Dashboard mockup ── */}
          <div
            className="hidden lg:block opacity-0-init animate-slide-in-right"
            style={{ animationDelay: "200ms" }}
          >
            <div className="relative">
              {/* Soft glow */}
              <div className="absolute -inset-6 bg-[#1E3A8A]/6 rounded-3xl blur-3xl" />

              {/* Browser window */}
              <div className="relative bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
                {/* Chrome bar */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-300" />
                    <div className="w-3 h-3 rounded-full bg-yellow-300" />
                    <div className="w-3 h-3 rounded-full bg-green-300" />
                  </div>
                  <div className="flex-1 bg-white rounded-md h-6 mx-4 flex items-center px-3">
                    <span className="text-xs text-gray-400">app.restopos.es/admin</span>
                  </div>
                </div>

                {/* App content */}
                <div className="p-5 bg-[#F5F7FB]">
                  {/* Top bar */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Panel de control</p>
                      <p className="text-sm font-bold text-[#0B1E3A]">Hoy — 22 mar 2026</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      En vivo
                    </span>
                  </div>

                  {/* KPI cards */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: "Pedidos hoy", value: "127", badge: "+12%", color: "text-green-600" },
                      { label: "Ingresos", value: "€4.280", badge: "+8%", color: "text-green-600" },
                      { label: "Ticket medio", value: "€33,7", badge: "-2%", color: "text-red-500" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                        <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                        <p className="text-lg font-extrabold text-[#0B1E3A]">{s.value}</p>
                        <p className={`text-xs font-semibold ${s.color}`}>{s.badge}</p>
                      </div>
                    ))}
                  </div>

                  {/* Live order row */}
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pedidos recientes</p>
                      <span className="text-xs text-[#1E3A8A] font-semibold">Ver todos →</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {/* Animated top row */}
                      <div
                        key={liveOrders[activeOrder].id}
                        className={`flex items-center justify-between px-4 py-2.5 transition-opacity duration-300 ${
                          orderVisible ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono font-bold text-[#1E3A8A]">
                            {liveOrders[activeOrder].id}
                          </span>
                          <div>
                            <p className="text-xs font-medium text-gray-700">{liveOrders[activeOrder].item}</p>
                            <p className="text-xs text-gray-400">{liveOrders[activeOrder].channel}</p>
                          </div>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${liveOrders[activeOrder].statusClass}`}>
                          {liveOrders[activeOrder].status}
                        </span>
                      </div>
                      {/* Static rows */}
                      {[
                        { id: "#1041", channel: "QR Mesa 5", item: "Menú shawarma x2", status: "Listo", statusClass: "bg-purple-50 text-purple-600 border-purple-100" },
                        { id: "#1040", channel: "TPV", item: "Falafel wrap", status: "Entregado", statusClass: "bg-green-50 text-green-600 border-green-100" },
                      ].map((o) => (
                        <div key={o.id} className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-[#0B1E3A]">{o.id}</span>
                            <div>
                              <p className="text-xs font-medium text-gray-700">{o.item}</p>
                              <p className="text-xs text-gray-400">{o.channel}</p>
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${o.statusClass}`}>
                            {o.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating badge — animate-float */}
              <div className="absolute -bottom-5 -left-5 bg-[#1E3A8A] text-white rounded-2xl px-4 py-3 shadow-xl animate-float">
                <p className="text-xs font-medium opacity-70">Pedidos este mes</p>
                <p className="text-2xl font-extrabold tabular-nums">
                  {ordersCount.toLocaleString("es-ES")}
                </p>
              </div>

              {/* Top-right floating tag */}
              <div
                className="absolute -top-3 -right-3 bg-white border border-gray-100 shadow-lg rounded-xl px-3 py-2 animate-float-slow"
                style={{ animationDelay: "1s" }}
              >
                <p className="text-xs font-bold text-[#0B1E3A]">Sin comisiones</p>
                <p className="text-xs text-gray-400">€0 por pedido</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default HeroSection;
