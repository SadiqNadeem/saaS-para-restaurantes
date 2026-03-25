import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Check, MessageCircle } from "lucide-react";

const plans = [
  {
    name: "Básico",
    price: "€49",
    period: "/mes",
    description: "Para empezar a recibir pedidos online sin depender de terceros.",
    features: [
      "Carta digital propia",
      "Pedidos online sin comisión",
      "Panel de administración",
      "Soporte por email",
      "Configuración incluida",
    ],
    highlighted: false,
    cta: "Empezar ahora",
    href: "#demo",
  },
  {
    name: "Profesional",
    price: "€89",
    period: "/mes",
    description: "La opción más completa para restaurantes en crecimiento.",
    features: [
      "Todo lo del Básico",
      "TPV táctil en la nube",
      "Pantalla de cocina",
      "Gestión de repartidores",
      "Base de datos de clientes",
      "Métricas e informes avanzados",
      "Soporte prioritario",
    ],
    highlighted: true,
    cta: "Empezar ahora",
    href: "#demo",
  },
  {
    name: "Completo",
    price: "A medida",
    period: "",
    description: "Para grupos de restaurantes, franquicias y cadenas.",
    features: [
      "Todo lo del Profesional",
      "Multi-local",
      "Integración con tu web actual",
      "Formación presencial",
      "Account manager dedicado",
      "SLA garantizado",
    ],
    highlighted: false,
    cta: "Hablar con ventas",
    href: "https://wa.me/34600000000",
  },
];

const guarantees = [
  "Sin comisiones por pedido",
  "Sin permanencia",
  "Soporte incluido",
  "Configuración incluida",
];

const PricingSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="pricing" className="py-20 bg-[#F5F7FB]" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`max-w-2xl mx-auto text-center mb-6 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="text-xs font-bold text-[#1E3A8A] uppercase tracking-widest mb-3">
            Precios
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1E3A] leading-tight">
            Planes claros, sin letra pequeña
          </h2>
          <p className="mt-4 text-gray-500 text-lg">
            Paga una cuota fija. Sin comisiones por pedido, sin sorpresas al final del mes.
          </p>
        </div>

        {/* Guarantees strip */}
        <div
          className={`flex flex-wrap justify-center gap-x-6 gap-y-2 mb-12 transition-all duration-700 delay-100 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          {guarantees.map((g) => (
            <span key={g} className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
              <svg className="w-4 h-4 text-[#1E3A8A] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {g}
            </span>
          ))}
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <div
              key={plan.name}
              className={`card-shine${plan.highlighted ? "-dark" : ""} relative rounded-2xl border p-8 flex flex-col hover:-translate-y-2 ${
                plan.highlighted
                  ? "bg-[#0B1E3A] border-[#1E3A8A] shadow-2xl"
                  : "bg-white border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-100"
              } ${isVisible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}`}
              style={{
                transition: `opacity 0.55s cubic-bezier(0.16,1,0.3,1) ${150 + i * 100}ms, transform 0.55s cubic-bezier(0.16,1,0.3,1) ${150 + i * 100}ms, box-shadow 0.3s, border-color 0.3s`,
              }}
            >
              {plan.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-[#1E3A8A] text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md">
                    Más popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3
                  className={`text-lg font-bold mb-1 ${
                    plan.highlighted ? "text-white" : "text-[#0B1E3A]"
                  }`}
                >
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span
                    className={`text-4xl font-extrabold ${
                      plan.highlighted ? "text-white" : "text-[#0B1E3A]"
                    }`}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className={`text-sm ${plan.highlighted ? "text-blue-300" : "text-gray-400"}`}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <p
                  className={`text-sm leading-relaxed ${
                    plan.highlighted ? "text-blue-200" : "text-gray-500"
                  }`}
                >
                  {plan.description}
                </p>
              </div>

              <a
                href={plan.href}
                target={plan.href.startsWith("http") ? "_blank" : undefined}
                rel={plan.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className={`block text-center font-semibold py-3 rounded-xl mb-6 transition-all duration-200 hover:-translate-y-0.5 ${
                  plan.highlighted
                    ? "bg-white text-[#0B1E3A] hover:bg-gray-50"
                    : "bg-[#1E3A8A] text-white hover:bg-[#0B1E3A]"
                }`}
              >
                {plan.cta}
              </a>

              <ul className="space-y-3 mt-auto">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check
                      size={15}
                      className={`mt-0.5 flex-shrink-0 ${
                        plan.highlighted ? "text-blue-300" : "text-[#1E3A8A]"
                      }`}
                    />
                    <span className={plan.highlighted ? "text-blue-100" : "text-gray-600"}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className={`text-center mt-10 transition-all duration-700 delay-500 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <a
            href="https://wa.me/34600000000"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#0B1E3A] transition-colors"
          >
            <MessageCircle size={16} className="text-green-500" />
            ¿Tienes dudas sobre el plan que necesitas? Escríbenos por WhatsApp.
          </a>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
