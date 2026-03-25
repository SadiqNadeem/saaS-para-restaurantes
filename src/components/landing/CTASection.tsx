import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ArrowRight, MessageCircle } from "lucide-react";

const CTASection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="contact" className="py-20 bg-white" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`relative overflow-hidden rounded-3xl bg-[#0B1E3A] px-8 py-16 sm:px-16 sm:py-20 transition-all duration-700 ${
            isVisible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-[0.97] translate-y-6"
          }`}
        >
          {/* Subtle dot grid */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* Animated floating orbs */}
          <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-[#1E3A8A]/25 blur-3xl pointer-events-none animate-float-slow" />
          <div
            className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-[#1E3A8A]/20 blur-3xl pointer-events-none animate-float"
            style={{ animationDelay: "1.5s" }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-40 rounded-full bg-blue-700/10 blur-3xl pointer-events-none animate-float-slow"
            style={{ animationDelay: "0.8s" }}
          />

          {/* Content */}
          <div className="relative text-center max-w-2xl mx-auto">
            <p
              className={`text-xs font-bold text-blue-300 uppercase tracking-widest mb-4 transition-all duration-700 delay-100 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              Hablemos
            </p>
            <h2
              className={`text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white leading-tight mb-4 transition-all duration-700 delay-150 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              ¿Hablamos y te enseño cómo funcionaría en tu restaurante?
            </h2>
            <p
              className={`text-blue-200 text-lg mb-10 leading-relaxed transition-all duration-700 delay-200 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              Sin compromisos ni letra pequeña. En 30 minutos te mostramos el sistema en vivo y respondemos todas tus dudas.
            </p>

            <div
              className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-300 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              {/* WhatsApp button */}
              <a
                href="https://wa.me/34600000000"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2.5 bg-white text-[#0B1E3A] font-bold px-7 py-4 rounded-xl transition-all duration-200 hover:bg-gray-50 hover:shadow-xl hover:-translate-y-1"
              >
                <MessageCircle
                  size={20}
                  className="text-green-500 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6"
                />
                Hablar por WhatsApp
              </a>

              {/* Demo button — shimmer */}
              <a
                href="#demo"
                className="btn-shimmer group inline-flex items-center gap-2.5 text-white font-bold px-7 py-4 rounded-xl border border-[#2d4fa3]"
              >
                Pedir demo
                <ArrowRight
                  size={18}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </a>
            </div>

            <p
              className={`mt-8 text-blue-300/60 text-sm transition-all duration-700 delay-400 ${
                isVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              Sin tarjeta de crédito · Sin permanencia · Respuesta en menos de 2 horas
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
