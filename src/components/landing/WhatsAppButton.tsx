import { MessageCircle } from "lucide-react";
import { useState } from "react";

const WhatsAppButton = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
      {hovered && (
        <div className="bg-card text-foreground text-sm font-medium px-4 py-2 rounded-xl border border-border shadow-lg animate-fade-in-up whitespace-nowrap">
          Chatea con nosotros por WhatsApp
        </div>
      )}
      <a
        href="https://wa.me/34600000000"
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-14 h-14 bg-[#25D366] hover:bg-[#20b558] text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all duration-200"
      >
        <MessageCircle size={26} />
      </a>
    </div>
  );
};

export default WhatsAppButton;
