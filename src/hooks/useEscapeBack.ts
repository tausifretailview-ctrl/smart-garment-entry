import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export const useEscapeBack = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;

      // Don't fire when focus is inside form elements
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

      // Don't fire when a dialog, popover, or dropdown is open
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]'
        )
      ) return;

      // Don't navigate back on root dashboard
      if (location.pathname === "/" || location.pathname.match(/^\/org\/[^/]+\/?$/)) return;

      e.preventDefault();
      navigate(-1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, location.pathname]);
};
