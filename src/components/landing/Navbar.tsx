import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

const links = [
  { label: "Inicio", href: "#" },
  { label: "Funciones", href: "#features" },
  { label: "Precios", href: "#pricing" },
  { label: "Demo", href: "#demo" },
  { label: "Contacto", href: "#contact" },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white border-b border-gray-100 shadow-sm"
          : "bg-white/95 backdrop-blur-sm"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1E3A8A] flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="text-xl font-bold text-[#0B1E3A]">
              Resto<span className="text-[#1E3A8A]">POS</span>
            </span>
          </a>

          {/* Desktop menu */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-gray-600 hover:text-[#0B1E3A] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-medium text-gray-600 hover:text-[#0B1E3A] transition-colors"
            >
              Acceder
            </Link>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 bg-[#1E3A8A] hover:bg-[#0B1E3A] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors duration-200"
            >
              Pedir demo
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 text-gray-600 hover:text-[#0B1E3A]"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menú"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-1">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-gray-700 hover:text-[#0B1E3A] hover:bg-gray-50 rounded-lg transition-colors"
            >
              {l.label}
            </a>
          ))}
          <div className="pt-3 mt-3 border-t border-gray-100 space-y-2">
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-gray-600 hover:text-[#0B1E3A] rounded-lg"
            >
              Acceder
            </Link>
            <a
              href="#demo"
              onClick={() => setMobileOpen(false)}
              className="block text-center bg-[#1E3A8A] text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0B1E3A] transition-colors"
            >
              Pedir demo
            </a>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
