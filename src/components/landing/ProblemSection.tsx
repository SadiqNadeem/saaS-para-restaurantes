import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Percent, PhoneMissed, ChefHat, Truck, Users } from "lucide-react";

const problems = [
  {
    icon: Percent,
    title: "Pagas comisiones a Glovo o Uber",
    description: "Hasta el 30% de cada pedido online se lo queda la plataforma. Eso es dinero directo de tu beneficio.",
  },
  {
    icon: PhoneMissed,
    title: "Pierdes pedidos por teléfono",
    description: "Pedidos que no se anotan, que llegan a deshora o que se confunden. Cada error cuesta dinero y clientes.",
  },
  {
    icon: ChefHat,
    title: "No tienes control de cocina",
    description: "Los pedidos llegan en papel o de forma verbal. Sin pantalla de cocina, los errores y las esperas aumentan.",
  },
  {
    icon: Truck,
    title: "No sabes qué hace cada repartidor",
    description: "Sin sistema, no puedes asignar, rastrear ni optimizar los repartos. La experiencia del cliente sufre.",
  },
  {
    icon: Users,
    title: "No tienes base de datos de clientes",
    description: "Cada cliente que pide por apps ajenas es tuyo, pero ellos se quedan con los datos. Tú no puedes fidelizarlo.",
  },
];

const ProblemSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-20 bg-[#F5F7FB]" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`max-w-2xl mx-auto text-center mb-14 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="text-xs font-bold text-[#1E3A8A] uppercase tracking-widest mb-3">
            El problema
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1E3A] leading-tight">
            Sabemos lo que pasa en la mayoría de restaurantes
          </h2>
          <p className="mt-4 text-gray-500 text-lg">
            Llevas el negocio con herramientas que no están pensadas para ti. Eso tiene un coste real.
          </p>
        </div>

        {/* Problem cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {problems.map((p, i) => (
            <div
              key={p.title}
              className={`card-shine bg-white rounded-2xl p-6 border border-gray-100 shadow-sm group hover:shadow-lg hover:-translate-y-1 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{
                transition: `opacity 0.6s ease ${80 + i * 80}ms, transform 0.6s ease ${80 + i * 80}ms, box-shadow 0.3s`,
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110 group-hover:bg-red-100">
                <p.icon size={20} className="text-red-500 transition-transform duration-300 group-hover:rotate-6" />
              </div>
              <h3 className="font-bold text-[#0B1E3A] mb-2">{p.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{p.description}</p>
            </div>
          ))}

          {/* Closing CTA card */}
          <div
            className={`card-shine-dark bg-[#0B1E3A] rounded-2xl p-6 flex flex-col justify-center hover:-translate-y-1 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
            style={{
              transition: `opacity 0.6s ease ${80 + problems.length * 80}ms, transform 0.6s ease ${80 + problems.length * 80}ms`,
            }}
          >
            <p className="text-2xl font-extrabold text-white leading-tight mb-3">
              Existe una forma mejor de gestionar tu restaurante.
            </p>
            <a
              href="#features"
              className="group inline-flex items-center gap-1 text-sm font-semibold text-blue-300 hover:text-white transition-colors"
            >
              Ver la solución
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
