import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { MousePointerClick, Zap, ChefHat, PackageCheck, Database } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: MousePointerClick,
    title: "El cliente hace el pedido en tu web",
    description: "Desde el móvil o el ordenador, el cliente elige sus platos y paga directamente en tu web. Sin intermediarios.",
  },
  {
    number: "02",
    icon: Zap,
    title: "El pedido llega a cocina al instante",
    description: "En segundos el pedido aparece en la pantalla de cocina. Sin papel, sin llamadas, sin errores de transcripción.",
  },
  {
    number: "03",
    icon: ChefHat,
    title: "Cocina prepara el pedido",
    description: "El equipo ve exactamente qué preparar, en qué orden y para qué canal. Todo organizado y en tiempo real.",
  },
  {
    number: "04",
    icon: PackageCheck,
    title: "Reparto o recogida en local",
    description: "Si es delivery, se asigna al repartidor. Si es para recoger, el cliente recibe un aviso cuando está listo.",
  },
  {
    number: "05",
    icon: Database,
    title: "Todo queda registrado en el sistema",
    description: "Ventas, clientes, productos más pedidos, horas punta. Datos que puedes usar para crecer.",
  },
];

const HowItWorksSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="how-it-works" className="py-20 bg-[#F5F7FB]" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`max-w-2xl mx-auto text-center mb-16 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="text-xs font-bold text-[#1E3A8A] uppercase tracking-widest mb-3">
            Cómo funciona
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1E3A] leading-tight">
            Del pedido al registro, sin fricciones
          </h2>
          <p className="mt-4 text-gray-500 text-lg">
            Un flujo diseñado para que tu equipo trabaje menos y tu restaurante funcione mejor.
          </p>
        </div>

        {/* Steps */}
        <div className="relative max-w-3xl mx-auto">
          {/* Animated timeline line */}
          <div className="absolute left-8 top-0 bottom-0 w-px bg-gray-200 hidden sm:block overflow-hidden">
            <div
              className={`w-full bg-gradient-to-b from-[#1E3A8A] to-[#1E3A8A]/30 ${
                isVisible ? "animate-draw-line" : "h-0"
              }`}
              style={{ animationDelay: "200ms", animationFillMode: "forwards" }}
            />
          </div>

          <div className="space-y-6">
            {steps.map((step, i) => (
              <div
                key={step.number}
                className={`relative flex gap-6 items-start transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"
                }`}
                style={{ transitionDelay: `${180 + i * 130}ms` }}
              >
                {/* Step indicator with bounce entrance */}
                <div
                  className={`relative flex-shrink-0 w-16 h-16 rounded-2xl bg-white border-2 flex flex-col items-center justify-center z-10 group-hover:scale-105 transition-all duration-500 ${
                    isVisible
                      ? "border-[#1E3A8A]/20 shadow-md"
                      : "border-gray-100 shadow-sm"
                  }`}
                  style={{ transitionDelay: `${180 + i * 130}ms` }}
                >
                  {/* Active dot */}
                  {isVisible && (
                    <span
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#1E3A8A] border-2 border-white opacity-0-init animate-pop-in"
                      style={{ animationDelay: `${400 + i * 130}ms` }}
                    />
                  )}
                  <span className="text-[10px] font-extrabold text-[#1E3A8A] tracking-widest leading-none">{step.number}</span>
                  <step.icon
                    size={18}
                    className="text-[#0B1E3A] mt-0.5"
                  />
                </div>

                {/* Content card */}
                <div className="card-shine flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  <h3 className="font-bold text-[#0B1E3A] mb-1.5">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
