import { Package, Mail, Phone, MapPin, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export const Footer = () => {
  const navigate = useNavigate();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const footerLinks = {
    product: [
      { label: "Dashboard", path: "/", id: "dash" },
      { label: "Products", path: "/product-entry", id: "prod" },
      { label: "Sales", path: "/pos-sales", id: "sales" },
      { label: "Reports", path: "/stock-report", id: "reports" },
    ],
    resources: [
      { label: "Help Center", path: "#", id: "help" },
      { label: "Documentation", path: "#", id: "docs" },
      { label: "Tutorials", path: "#", id: "tutorials" },
      { label: "API Reference", path: "#", id: "api" },
    ],
    company: [
      { label: "About Us", path: "#", id: "about" },
      { label: "Contact", path: "#", id: "contact" },
      { label: "Privacy Policy", path: "#", id: "privacy" },
      { label: "Terms of Service", path: "#", id: "terms" },
    ],
  };

  return (
    <footer className="relative border-t border-sidebar-border bg-sidebar text-sidebar-foreground mt-auto">
      <div className="container px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="absolute inset-0 bg-sidebar-primary rounded-lg blur-md opacity-50" />
                <div className="relative bg-sidebar-primary p-2 rounded-lg">
                  <Package className="h-5 w-5 text-sidebar-primary-foreground" />
                </div>
              </div>
              <span className="font-display text-lg font-bold text-sidebar-primary dark:text-white">
                Smart Inventory
              </span>
            </div>
            <p className="text-sm text-sidebar-foreground/70">
              Powerful multi-tenant POS and inventory management system for modern businesses.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent/20 hover:text-sidebar-primary">
                <Mail className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent/20 hover:text-sidebar-primary">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent/20 hover:text-sidebar-primary">
                <MapPin className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4 text-sidebar-foreground">Quick Links</h3>
            <ul className="space-y-2">
              {footerLinks.product.map((link) => (
                <li key={link.id}>
                  <button
                    onClick={() => navigate(link.path)}
                    className="text-sm text-sidebar-foreground/70 hover:text-sidebar-primary transition-colors"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-semibold mb-4 text-sidebar-foreground">Resources</h3>
            <ul className="space-y-2">
              {footerLinks.resources.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.path}
                    className="text-sm text-sidebar-foreground/70 hover:text-sidebar-primary transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold mb-4 text-sidebar-foreground">Company</h3>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.path}
                    className="text-sm text-sidebar-foreground/70 hover:text-sidebar-primary transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-sidebar-border flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-sidebar-foreground/70">
            © {new Date().getFullYear()} Smart Inventory. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-sidebar-foreground/70">
            <span>Version 1.0.0</span>
            <span>•</span>
            <a href="#" className="hover:text-sidebar-primary transition-colors">
              Privacy
            </a>
            <span>•</span>
            <a href="#" className="hover:text-sidebar-primary transition-colors">
              Terms
            </a>
          </div>
        </div>
      </div>

      {/* Back to Top Button */}
      <Button
        onClick={scrollToTop}
        size="icon"
        className="fixed bottom-8 right-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 shadow-lg z-50"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </footer>
  );
};
