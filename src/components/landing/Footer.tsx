import { Link } from "react-router-dom";
import { Phone, Mail, MessageCircle } from "lucide-react";

const footerLinks = {
  Producto: [
    { label: "Funciones", href: "#features" },
    { label: "Precios", href: "#pricing" },
    { label: "Demo", href: "#demo" },
    { label: "Cómo funciona", href: "#how-it-works" },
  ],
  Empresa: [
    { label: "Sobre nosotros", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Trabaja con nosotros", href: "#" },
    { label: "Contacto", href: "#contact" },
  ],
  Legal: [
    { label: "Política de privacidad", href: "#" },
    { label: "Términos de uso", href: "#" },
    { label: "Cookies", href: "#" },
  ],
};

const Footer = () => {
  return (
    <footer className="bg-[#0B1E3A] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#1E3A8A] flex items-center justify-center">
                <span className="text-white font-bold text-sm">R</span>
              </div>
              <span className="text-xl font-bold text-white">
                Resto<span className="text-blue-400">POS</span>
              </span>
            </div>
            <p className="text-blue-200/70 text-sm leading-relaxed mb-6 max-w-xs">
              La plataforma todo-en-uno de TPV y pedidos online para restaurantes que quieren crecer sin depender de terceros.
            </p>
            {/* Contact info */}
            <div className="space-y-2">
              <a
                href="tel:+34600000000"
                className="flex items-center gap-2.5 text-sm text-blue-200/70 hover:text-white transition-colors"
              >
                <Phone size={15} className="text-blue-400 flex-shrink-0" />
                +34 600 000 000
              </a>
              <a
                href="mailto:hola@restopos.es"
                className="flex items-center gap-2.5 text-sm text-blue-200/70 hover:text-white transition-colors"
              >
                <Mail size={15} className="text-blue-400 flex-shrink-0" />
                hola@restopos.es
              </a>
              <a
                href="https://wa.me/34600000000"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-sm text-blue-200/70 hover:text-white transition-colors"
              >
                <MessageCircle size={15} className="text-green-400 flex-shrink-0" />
                WhatsApp
              </a>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-4">
                {category}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-blue-200/60 hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-white/30">
            © {new Date().getFullYear()} RestoPOS. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="text-sm text-white/30 hover:text-white transition-colors"
            >
              Acceder
            </Link>
            <Link
              to="/register"
              className="text-sm text-white/30 hover:text-white transition-colors"
            >
              Registrarse
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
