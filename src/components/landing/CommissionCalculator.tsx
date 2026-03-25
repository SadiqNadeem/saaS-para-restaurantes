import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calculator } from "lucide-react";

const CommissionCalculator = () => {
  const { ref, isVisible } = useScrollAnimation();
  const [ordersPerDay, setOrdersPerDay] = useState(40);
  const [avgOrderValue, setAvgOrderValue] = useState(25);
  const [commissionPct, setCommissionPct] = useState(25);

  const monthlyCost = useMemo(() => {
    return Math.round(ordersPerDay * avgOrderValue * (commissionPct / 100) * 30);
  }, [ordersPerDay, avgOrderValue, commissionPct]);

  return (
    <section className="py-20 bg-muted/50" ref={ref}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`text-center mb-12 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="inline-flex items-center gap-2 text-primary mb-3">
            <Calculator size={20} />
            <p className="text-sm font-semibold uppercase tracking-wider">Calculadora de comisiones</p>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            ¿Cuánto te están costando las apps de delivery?
          </h2>
        </div>

        <div
          className={`bg-card rounded-2xl border border-border shadow-lg p-6 sm:p-10 transition-all duration-700 delay-200 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="grid sm:grid-cols-3 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Pedidos por día
              </label>
              <input
                type="range"
                min={5}
                max={200}
                value={ordersPerDay}
                onChange={(e) => setOrdersPerDay(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-2xl font-bold text-foreground mt-1">{ordersPerDay}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Ticket medio (€)
              </label>
              <input
                type="range"
                min={5}
                max={80}
                value={avgOrderValue}
                onChange={(e) => setAvgOrderValue(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-2xl font-bold text-foreground mt-1">€{avgOrderValue}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Comisión del delivery (%)
              </label>
              <input
                type="range"
                min={10}
                max={35}
                value={commissionPct}
                onChange={(e) => setCommissionPct(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-2xl font-bold text-foreground mt-1">{commissionPct}%</p>
            </div>
          </div>

          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-6 text-center mb-6">
            <p className="text-sm text-muted-foreground mb-1">Estás pagando a las apps de delivery aproximadamente</p>
            <p className="text-4xl sm:text-5xl font-extrabold text-destructive">
              €{monthlyCost.toLocaleString("es-ES")}
              <span className="text-lg font-medium text-muted-foreground">/mes</span>
            </p>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center mb-8">
            <p className="text-lg font-semibold text-foreground">
              Podrías ahorrarte{" "}
              <span className="text-primary font-extrabold">€{monthlyCost.toLocaleString("es-ES")}+</span>{" "}
              al mes recibiendo pedidos directos.
            </p>
          </div>

          <div className="text-center">
            <Link to="/register">
              <Button size="lg" className="gap-2 text-base">
                Empieza a recibir pedidos directos <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CommissionCalculator;
