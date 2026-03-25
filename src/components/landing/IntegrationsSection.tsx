import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Globe, CreditCard, Truck, Printer, Tablet } from "lucide-react";

const integrations = [
  {
    icon: Globe,
    title: "Web de pedidos online",
    description: "Tu propia página de pedidos con tu marca y sin comisiones.",
  },
  {
    icon: CreditCard,
    title: "Pasarelas de pago",
    description: "Acepta tarjeta, Apple Pay y Google Pay.",
  },
  {
    icon: Truck,
    title: "Apps de delivery",
    description: "Conéctate con plataformas de reparto cuando lo necesites.",
  },
  {
    icon: Printer,
    title: "Impresoras de cocina",
    description: "Compatible con Epson, Star y otras impresoras de tickets.",
  },
  {
    icon: Tablet,
    title: "Tablets y hardware TPV",
    description: "Usa tablets, terminales o el hardware que ya tienes.",
  },
];

const IntegrationsSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-20" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`text-center max-w-2xl mx-auto mb-14 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Integraciones</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Funciona con las herramientas que ya usas
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
          {integrations.map((item, i) => (
            <div
              key={item.title}
              className={`bg-card rounded-xl border border-border p-5 text-center transition-all duration-700 hover:shadow-lg hover:-translate-y-1 hover:border-primary/30 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="w-11 h-11 mx-auto rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <item.icon className="text-primary" size={22} />
              </div>
              <h3 className="font-semibold text-foreground text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default IntegrationsSection;
