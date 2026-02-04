import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

// Global error handlers for async errors (not caught by React error boundaries)
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Don't prevent default - let ErrorBoundary handle if possible
});

window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
