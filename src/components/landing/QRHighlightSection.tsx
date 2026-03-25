import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { QrCode, Smartphone, ArrowRight } from "lucide-react";

const QRHighlightSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-20 bg-muted/50" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          {/* Izquierda */}
          <div>
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">
              Pedidos QR por mesa
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
              QR en cada mesa, sin app para el cliente
            </h2>
            <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
              Pon un QR en cada mesa. El cliente escanea, pide y paga desde su móvil. El pedido llega al instante al TPV.
            </p>
            <div className="mt-6 space-y-3">
              {[
                "Sin descarga de app",
                "Funciona en cualquier smartphone",
                "El pedido va directo a cocina",
                "El cliente paga desde el móvil",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-foreground">
                  <ArrowRight size={14} className="text-primary flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Derecha – ilustración */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-64 h-40 sm:w-80 sm:h-48 bg-card rounded-2xl border border-border shadow-lg flex items-center justify-center">
                <div className="bg-background rounded-xl border border-border p-4 shadow-sm">
                  <QrCode className="text-foreground" size={56} />
                  <p className="text-[10px] text-muted-foreground text-center mt-1 font-medium">
                    Escanea para pedir
                  </p>
                </div>
              </div>

              <div className="absolute -top-6 -right-6 sm:-top-8 sm:-right-8 bg-card rounded-2xl border border-primary/30 shadow-xl p-3 w-32 sm:w-40 animate-fade-in-up">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="text-primary" size={16} />
                  <span className="text-xs font-semibold text-foreground">Mesa 5</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Kebab grande</span>
                    <span className="text-foreground font-medium">€9,50</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Refresco</span>
                    <span className="text-foreground font-medium">€2,50</span>
                  </div>
                  <div className="h-px bg-border my-1" />
                  <div className="flex justify-between text-[10px] font-semibold">
                    <span className="text-foreground">Total</span>
                    <span className="text-primary">€12,00</span>
                  </div>
                </div>
                <div className="mt-2 bg-primary text-primary-foreground text-[10px] font-semibold text-center py-1 rounded-md">
                  Hacer pedido
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default QRHighlightSection;
