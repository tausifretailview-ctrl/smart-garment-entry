import React from "react";
import ReactDOM from "react-dom/client";
import CustomerApp from "./app";
import "./styles.css";
import { startInstallCapture } from "./lib/install";

// Before render: Chrome fires the install prompt event once, early.
startInstallCapture();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CustomerApp />
  </React.StrictMode>,
);
