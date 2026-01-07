import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n/config";
import { registerSW } from 'virtual:pwa-register';

// Auto-update service worker using vite-plugin-pwa
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);
