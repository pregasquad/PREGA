import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n/config";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.log('SW registration failed:', error);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
