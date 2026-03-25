import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const previews = [
  {
    id: "pos",
    label: "TPV",
    content: (
      <div className="bg-background rounded-lg p-6 space-y-4">
        <div className="flex gap-3 mb-4">
          {["Todos", "Mesa", "Para llevar", "Delivery"].map((t) => (
            <span key={t} className={`text-xs font-medium px-3 py-1.5 rounded-full ${t === "Todos" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {t}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-muted rounded-lg p-4 space-y-2">
              <div className="w-full h-16 bg-accent rounded-md" />
              <div className="h-3 bg-accent rounded w-3/4" />
              <div className="h-3 bg-primary/20 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "orders",
    label: "Pedidos",
    content: (
      <div className="bg-background rounded-lg p-6 space-y-3">
        {[
          "Nuevo #1055 – Mesa – Mesa 3",
          "Preparando #1054 – Online – Delivery",
          "Listo #1053 – QR – Mesa 7",
          "Completado #1052 – Para llevar",
        ].map((o, i) => (
          <div key={i} className="flex items-center justify-between bg-muted rounded-lg px-4 py-3">
            <span className="text-sm font-medium text-foreground">{o}</span>
            <div className="w-20 h-2 bg-primary/30 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${100 - i * 25}%` }} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "tables",
    label: "Plano de mesas",
    content: (
      <div className="bg-background rounded-lg p-6">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => {
            const statuses = ["bg-primary/20 border-primary/40", "bg-green-100 border-green-300", "bg-muted border-border"];
            return (
              <div key={i} className={`aspect-square rounded-xl border-2 ${statuses[i % 3]} flex items-center justify-center`}>
                <span className="text-sm font-semibold text-foreground">M{i + 1}</span>
              </div>
            );
          })}
        </div>
      </div>
    ),
  },
  {
    id: "online",
    label: "Carta online",
    content: (
      <div className="bg-background rounded-lg p-6 space-y-4">
        <div className="h-32 bg-primary/5 rounded-xl flex items-center justify-center">
          <span className="text-primary font-semibold">🥙 Tu carta online</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {["Kebab grande", "Ensalada César", "Falafel", "Shawarma pollo"].map((item) => (
            <div key={item} className="bg-muted rounded-lg p-3">
              <div className="w-full h-12 bg-accent rounded-md mb-2" />
              <p className="text-xs font-medium text-foreground">{item}</p>
              <p className="text-xs text-primary font-semibold">€8,99</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

const ProductPreviewSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-20" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center max-w-2xl mx-auto mb-14 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Vista previa</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Vélo en acción
          </h2>
        </div>

        <div className={`transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <div className="bg-card rounded-2xl border border-border shadow-xl p-1">
            <div className="bg-muted rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400/60" />
                  <div className="w-3 h-3 rounded-full bg-green-400/60" />
                </div>
                <div className="flex-1 bg-background rounded-md h-6 mx-4" />
              </div>

              <Tabs defaultValue="pos">
                <TabsList className="mb-4">
                  {previews.map((p) => (
                    <TabsTrigger key={p.id} value={p.id} className="text-xs">
                      {p.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {previews.map((p) => (
                  <TabsContent key={p.id} value={p.id}>
                    {p.content}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductPreviewSection;
