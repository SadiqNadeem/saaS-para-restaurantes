import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Check, X } from "lucide-react";

const rows = [
  { feature: "Comisión por pedido", them: "15–30%", us: "0%" },
  { feature: "Tu propia marca", them: false, us: true },
  { feature: "Datos de los clientes", them: false, us: true },
  { feature: "Relación directa con el cliente", them: false, us: true },
  { feature: "TPV integrado", them: false, us: true },
  { feature: "Pedidos QR por mesa", them: false, us: true },
  { feature: "Impresión en cocina", them: false, us: true },
  { feature: "Control total de tu carta", them: false, us: true },
];

const ComparisonSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-20" ref={ref}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center max-w-2xl mx-auto mb-14 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Comparativa</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Apps de delivery vs. tu propia plataforma
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Deja de regalar el 30% de cada pedido. Recupera el control de tus clientes y tus beneficios.
          </p>
        </div>

        <div className={`rounded-2xl border border-border overflow-hidden transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <div className="grid grid-cols-3 bg-muted px-6 py-4">
            <span className="text-sm font-semibold text-foreground">Función</span>
            <span className="text-sm font-semibold text-muted-foreground text-center">Apps de delivery</span>
            <span className="text-sm font-semibold text-primary text-center">KebabSaaS</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.feature} className={`grid grid-cols-3 px-6 py-4 ${i % 2 === 0 ? "bg-card" : "bg-muted/30"}`}>
              <span className="text-sm text-foreground">{r.feature}</span>
              <div className="flex justify-center">
                {typeof r.them === "string" ? (
                  <span className="text-sm text-muted-foreground">{r.them}</span>
                ) : r.them ? (
                  <Check size={18} className="text-primary" />
                ) : (
                  <X size={18} className="text-destructive/60" />
                )}
              </div>
              <div className="flex justify-center">
                {typeof r.us === "string" ? (
                  <span className="text-sm font-semibold text-primary">{r.us}</span>
                ) : r.us ? (
                  <Check size={18} className="text-primary" />
                ) : (
                  <X size={18} className="text-destructive/60" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ComparisonSection;
