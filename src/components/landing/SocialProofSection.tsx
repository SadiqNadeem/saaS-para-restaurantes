const trustLogos = ["🥙 Kebabs", "🍕 Pizzerías", "🍔 Hamburguesas", "🍣 Sushi", "🥡 Comida para llevar"];

const SocialProofSection = () => {
  return (
    <section className="py-14 border-b border-border" aria-label="Para todo tipo de restaurantes">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6">
          Para todo tipo de restaurantes
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 mb-6">
          {trustLogos.map((logo) => (
            <span
              key={logo}
              className="text-base sm:text-lg font-semibold text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              {logo}
            </span>
          ))}
        </div>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Restaurantes que usan KebabSaaS para aumentar sus pedidos directos y eliminar las comisiones de las apps de delivery.
        </p>
      </div>
    </section>
  );
};

export default SocialProofSection;
