import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Printer, Zap, Shield, UtensilsCrossed } from "lucide-react";

const points = [
  { icon: Printer, text: "Compatible con tu impresora de tickets actual" },
  { icon: Zap, text: "Configuración rápida en un día" },
  { icon: Shield, text: "Sistema de pedidos fiable" },
  { icon: UtensilsCrossed, text: "Diseñado para restaurantes con mucho movimiento" },
];

const ReliabilitySection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-16 border-t border-border" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`text-center mb-10 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            Hecho para restaurantes de verdad
          </h2>
        </div>
        <div
          className={`grid grid-cols-2 lg:grid-cols-4 gap-6 transition-all duration-700 delay-200 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          {points.map((p) => (
            <div key={p.text} className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <p.icon className="text-primary" size={22} />
              </div>
              <p className="text-sm font-medium text-foreground leading-snug">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ReliabilitySection;
