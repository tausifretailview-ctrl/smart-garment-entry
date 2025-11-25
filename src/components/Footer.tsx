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
    <footer className="relative border-t bg-gradient-to-br from-background via-background to-primary/5 mt-auto">
      <div className="container px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-lg blur-md opacity-50" />
                <div className="relative bg-gradient-to-br from-primary to-secondary p-2 rounded-lg">
                  <Package className="h-5 w-5 text-white" />
                </div>
              </div>
              <span className="font-display text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Smart Inventory
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Powerful multi-tenant POS and inventory management system for modern businesses.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Mail className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MapPin className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              {footerLinks.product.map((link) => (
                <li key={link.id}>
                  <button
                    onClick={() => navigate(link.path)}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-semibold mb-4">Resources</h3>
            <ul className="space-y-2">
              {footerLinks.resources.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.path}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold mb-4">Company</h3>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.path}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Smart Inventory. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Version 1.0.0</span>
            <span>•</span>
            <a href="#" className="hover:text-primary transition-colors">
              Privacy
            </a>
            <span>•</span>
            <a href="#" className="hover:text-primary transition-colors">
              Terms
            </a>
          </div>
        </div>
      </div>

      {/* Back to Top Button */}
      <Button
        onClick={scrollToTop}
        size="icon"
        className="fixed bottom-8 right-8 rounded-full shadow-elevated hover:shadow-glow z-50"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </footer>
  );
};
