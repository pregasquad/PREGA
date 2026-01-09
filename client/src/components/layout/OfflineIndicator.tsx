import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function OfflineIndicator() {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOnlineMessage, setShowOnlineMessage] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOnlineMessage(true);
      setTimeout(() => setShowOnlineMessage(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOnlineMessage(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {(!isOnline || showOnlineMessage) && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 0.3 }}
          className={`fixed top-0 left-0 right-0 z-50 py-2 px-4 text-center text-white text-sm font-medium flex items-center justify-center gap-2 ${
            isOnline ? "bg-emerald-500" : "bg-orange-500"
          }`}
        >
          {isOnline ? (
            <>
              <Wifi className="w-4 h-4" />
              {t("common.online")}
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4" />
              {t("common.offline")}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
