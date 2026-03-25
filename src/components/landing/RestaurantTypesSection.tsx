import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const types = [
  { name: "Kebabs", emoji: "🥙" },
  { name: "Pizzerías", emoji: "🍕" },
  { name: "Hamburguesas", emoji: "🍔" },
  { name: "Sushi", emoji: "🍣" },
  { name: "Comida para llevar", emoji: "🥡" },
];

const RestaurantTypesSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-20" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center max-w-2xl mx-auto mb-14 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Para quién es</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Perfecto para estos restaurantes
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Tanto si tienes un pequeño local de comida para llevar como una pizzería concurrida, KebabSaaS se adapta a tu flujo de trabajo.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
          {types.map((t, i) => (
            <div
              key={t.name}
              className={`bg-card rounded-xl border border-border p-6 text-center transition-all duration-700 hover:shadow-lg hover:-translate-y-1 hover:border-primary/30 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="text-4xl mb-3">{t.emoji}</div>
              <h3 className="font-semibold text-foreground text-sm">{t.name}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RestaurantTypesSection;
