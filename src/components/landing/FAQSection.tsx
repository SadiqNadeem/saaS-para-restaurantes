import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useEffect } from "react";

const faqs = [
  {
    question: "¿Qué es un TPV para restaurantes?",
    answer:
      "Un TPV (Terminal Punto de Venta) para restaurantes es el software que gestiona pedidos, cobros y el flujo de cocina. KebabSaaS combina TPV, pedidos online y pedidos QR por mesa en una sola plataforma.",
  },
  {
    question: "¿Cómo funciona el sistema de pedidos online?",
    answer:
      "Los clientes visitan la web de tu restaurante, navegan por la carta, realizan su pedido y pagan online. El pedido aparece al instante en el TPV y puede imprimirse automáticamente en cocina.",
  },
  {
    question: "¿Los clientes pueden pedir con QR en la mesa?",
    answer:
      "Sí. Cada mesa tiene un QR único. El cliente lo escanea con el móvil, ve la carta, pide y paga, todo sin descargar ninguna app. Los pedidos van directamente al TPV y a cocina.",
  },
  {
    question: "¿Hay comisiones por cada pedido?",
    answer:
      "No. KebabSaaS cobra cero comisiones por pedido. Pagas una suscripción mensual fija y te quedas con el 100% de los ingresos de cada pedido.",
  },
  {
    question: "¿Cuánto tiempo lleva configurarlo?",
    answer:
      "La mayoría de restaurantes están operativos en menos de un día. Te ayudamos a configurar tu carta, las impresoras y a poner en marcha tu página de pedidos online.",
  },
  {
    question: "¿Necesito comprar hardware nuevo?",
    answer:
      "No necesariamente. KebabSaaS funciona con cualquier tablet, ordenador o terminal. También es compatible con las impresoras de tickets más habituales (Epson, Star, etc.).",
  },
];

const FAQSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
    script.id = "faq-schema";
    document.head.appendChild(script);
    return () => {
      const el = document.getElementById("faq-schema");
      if (el) el.remove();
    };
  }, []);

  return (
    <section className="py-20" ref={ref} id="faq">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`text-center mb-12 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Preguntas frecuentes
          </h2>
        </div>

        <div
          className={`space-y-4 transition-all duration-700 delay-200 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="group bg-card rounded-xl border border-border overflow-hidden"
            >
              <summary className="flex items-center justify-between cursor-pointer px-6 py-5 text-foreground font-medium text-sm sm:text-base hover:bg-muted/50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                {faq.question}
                <span className="ml-4 text-muted-foreground group-open:rotate-45 transition-transform text-lg">
                  +
                </span>
              </summary>
              <div className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
