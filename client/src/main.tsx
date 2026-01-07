import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n/config";

// Restore session from local storage before app render to prevent 401s
if (typeof window !== 'undefined') {
  const localAuth = localStorage.getItem("user_authenticated") === "true";
  const sessionAuth = sessionStorage.getItem("user_authenticated") === "true";
  const wasLoggedOut = sessionStorage.getItem("explicit_logout") === "true" || 
                       localStorage.getItem("explicit_logout") === "true";
  
  if (localAuth && !sessionAuth && !wasLoggedOut) {
    sessionStorage.setItem("user_authenticated", "true");
    sessionStorage.setItem("current_user", localStorage.getItem("current_user") || "");
    sessionStorage.setItem("current_user_role", localStorage.getItem("current_user_role") || "");
    sessionStorage.setItem("current_user_permissions", localStorage.getItem("current_user_permissions") || "[]");
  }
}

// Register service worker for push notifications
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((registration) => {
      console.log('Service Worker registered with scope:', registration.scope);
    })
    .catch((error) => {
      console.error('Service Worker registration failed:', error);
    });
}

createRoot(document.getElementById("root")!).render(<App />);
