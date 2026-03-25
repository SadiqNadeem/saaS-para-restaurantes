import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Globe, Monitor, ChefHat, Truck, Users, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Globe,
    title: "Pedidos online",
    description: "Tu propia web de pedidos con dominio propio. Sin comisiones, sin intermediarios. Los pedidos llegan directamente a tu cocina.",
    highlight: false,
  },
  {
    icon: Monitor,
    title: "TPV táctil",
    description: "Terminal punto de venta en la nube. Funciona desde cualquier tablet o pantalla. Gestiona mesas, barra y take away en un solo panel.",
    highlight: false,
  },
  {
    icon: ChefHat,
    title: "Pantalla de cocina",
    description: "Los pedidos aparecen automáticamente en la pantalla de cocina. Sin papel, sin gritos, sin errores. El equipo sabe exactamente qué preparar.",
    highlight: true,
  },
  {
    icon: Truck,
    title: "Gestión de repartidores",
    description: "Asigna pedidos a repartidores, sigue el estado de cada entrega y mantén informado al cliente en tiempo real.",
    highlight: false,
  },
  {
    icon: Users,
    title: "Base de datos de clientes",
    description: "Cada pedido genera un registro de cliente. Historial de pedidos, preferencias y datos de contacto. Todos son tuyos.",
    highlight: false,
  },
  {
    icon: BarChart3,
    title: "Informes y estadísticas",
    description: "Dashboard con ventas por día, productos más pedidos, ticket medio, horas punta y mucho más. Toma decisiones con datos reales.",
    highlight: false,
  },
];

const FeaturesSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="features" className="py-20 bg-white" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`max-w-2xl mx-auto text-center mb-16 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="text-xs font-bold text-[#1E3A8A] uppercase tracking-widest mb-3">
            La solución
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1E3A] leading-tight">
            Todo en un solo sistema
          </h2>
          <p className="mt-4 text-gray-500 text-lg">
            Una plataforma diseñada para restaurantes que quieren crecer sin depender de nadie.
          </p>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`card-shine${f.highlight ? "-dark" : ""} relative rounded-2xl p-7 border group cursor-default transition-all duration-500 hover:-translate-y-1.5 ${
                f.highlight
                  ? "bg-[#0B1E3A] border-[#1E3A8A] shadow-lg"
                  : "bg-white border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-100"
              } ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{
                transition: `opacity 0.6s ease ${i * 80}ms, transform 0.6s ease ${i * 80}ms, box-shadow 0.3s, border-color 0.3s`,
              }}
            >
              {/* Icon wrapper with hover pop */}
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110 ${
                  f.highlight
                    ? "bg-white/10 group-hover:bg-white/20"
                    : "bg-[#F5F7FB] group-hover:bg-blue-50"
                }`}
              >
                <f.icon
                  size={22}
                  className={`transition-transform duration-300 group-hover:rotate-6 ${
                    f.highlight ? "text-blue-300" : "text-[#1E3A8A]"
                  }`}
                />
              </div>

              <h3
                className={`font-bold text-lg mb-2 ${
                  f.highlight ? "text-white" : "text-[#0B1E3A]"
                }`}
              >
                {f.title}
              </h3>
              <p
                className={`text-sm leading-relaxed ${
                  f.highlight ? "text-blue-200" : "text-gray-500"
                }`}
              >
                {f.description}
              </p>

              {/* Bottom accent line on hover */}
              {!f.highlight && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E3A8A] rounded-b-2xl scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
