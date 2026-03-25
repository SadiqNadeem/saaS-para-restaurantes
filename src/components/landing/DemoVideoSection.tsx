import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Play, MessageCircle } from "lucide-react";

const DemoVideoSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="demo" className="py-20 bg-white" ref={ref}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Header */}
        <div
          className={`transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="text-xs font-bold text-[#1E3A8A] uppercase tracking-widest mb-3">
            Demo
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1E3A] leading-tight mb-4">
            Vélo en acción antes de decidir
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto mb-10">
            Te hacemos una demo personalizada adaptada a tu tipo de restaurante. Sin compromisos, sin tarjeta.
          </p>
        </div>

        {/* Mockup screen */}
        <div
          className={`relative bg-[#0B1E3A] rounded-3xl overflow-hidden shadow-2xl mb-10 transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          {/* Animated grid */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          {/* Orb top-left */}
          <div className="absolute top-0 left-0 w-64 h-64 bg-[#1E3A8A]/30 rounded-full blur-3xl pointer-events-none animate-float-slow" />
          {/* Orb bottom-right */}
          <div className="absolute bottom-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none animate-float" style={{ animationDelay: "1.2s" }} />

          <div className="aspect-video flex items-center justify-center relative">
            {/* Play button with ping ring */}
            <button
              className="relative z-10 w-20 h-20 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all duration-300 hover:scale-110 group"
              aria-label="Ver demo"
            >
              {/* Outer ping ring */}
              <span className="absolute inset-0 rounded-full bg-white/10 animate-ping-ring" />
              <Play
                size={32}
                className="text-white ml-1 transition-transform duration-300 group-hover:scale-110"
                fill="white"
              />
            </button>
            <div className="absolute bottom-6 left-0 right-0 text-center">
              <span className="text-white/50 text-sm">Demo real del panel de administración</span>
            </div>
          </div>
        </div>

        {/* CTA buttons */}
        <div
          className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <a
            href="#contact"
            className="btn-shimmer group inline-flex items-center gap-2 text-white font-semibold px-7 py-3.5 rounded-lg"
          >
            Pedir demo gratuita
          </a>
          <a
            href="https://wa.me/34600000000"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 bg-white border-2 border-gray-200 text-[#0B1E3A] font-semibold px-7 py-3.5 rounded-lg transition-all duration-200 hover:border-[#1E3A8A] hover:shadow-md hover:-translate-y-0.5"
          >
            <MessageCircle size={18} className="text-green-500 transition-transform duration-300 group-hover:scale-110" />
            Hablar por WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
};

export default DemoVideoSection;
