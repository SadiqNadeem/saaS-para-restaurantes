import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { TrendingUp, BadgePercent, Zap, Settings } from "lucide-react";

const benefits = [
  { icon: TrendingUp, title: "Más pedidos online", description: "Consigue más pedidos directos a través de tu web y los QR de mesa.", metric: "+40%" },
  { icon: BadgePercent, title: "Sin comisiones de delivery", description: "Deja de pagar el 15–30% a las apps de delivery en cada pedido.", metric: "0%" },
  { icon: Zap, title: "Atiende más rápido", description: "Los pedidos van del cliente a cocina automáticamente en segundos.", metric: "3x" },
  { icon: Settings, title: "Simplifica las operaciones", description: "Una sola plataforma reemplaza múltiples herramientas y procesos manuales.", metric: "1" },
];

const BenefitsSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-20 bg-muted/50" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center max-w-2xl mx-auto mb-14 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Beneficios</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Resultados reales para tu restaurante
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((b, i) => (
            <div
              key={b.title}
              className={`bg-card rounded-xl border border-border p-6 text-center transition-all duration-700 hover:shadow-lg hover:-translate-y-1 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="w-12 h-12 mx-auto rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <b.icon className="text-primary" size={24} />
              </div>
              <div className="text-3xl font-extrabold text-primary mb-2">{b.metric}</div>
              <h3 className="font-semibold text-foreground mb-2">{b.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BenefitsSection;
