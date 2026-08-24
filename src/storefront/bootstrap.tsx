import { createRoot } from "react-dom/client";
import { hideAppBootSplash } from "@/lib/appBootSplash";
import { StorefrontApp } from "./StorefrontApp";
import "./storefront.css";

hideAppBootSplash();

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

createRoot(document.getElementById("root")!).render(<StorefrontApp />);
