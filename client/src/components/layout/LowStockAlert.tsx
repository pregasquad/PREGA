import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Package, X } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Product } from "@shared/schema";

export function LowStockAlert() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<number[]>([]);
  const previousLowStockIds = useRef<Set<number>>(new Set());
  const isInitialized = useRef(false);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    staleTime: 60000,
  });

  const allLowStockProducts = useMemo(() => {
    return products.filter(
      (p) => Number(p.quantity || 0) <= Number(p.lowStockThreshold || 5)
    );
  }, [products]);

  useEffect(() => {
    if (isLoading || products.length === 0) return;
    
    const currentLowStockIds = new Set(allLowStockProducts.map(p => p.id));
    const storedDismissed = sessionStorage.getItem("dismissed_low_stock");
    
    if (!isInitialized.current) {
      isInitialized.current = true;
      previousLowStockIds.current = currentLowStockIds;
      
      if (storedDismissed) {
        const parsedDismissed = JSON.parse(storedDismissed) as number[];
        const validDismissed = parsedDismissed.filter(id => currentLowStockIds.has(id));
        setDismissed(validDismissed);
        if (validDismissed.length !== parsedDismissed.length) {
          sessionStorage.setItem("dismissed_low_stock", JSON.stringify(validDismissed));
        }
      }
      return;
    }
    
    if (storedDismissed) {
      const parsedDismissed = JSON.parse(storedDismissed) as number[];
      const validDismissed = parsedDismissed.filter(id => currentLowStockIds.has(id));
      
      const newLowStockIds = allLowStockProducts
        .filter(p => !previousLowStockIds.current.has(p.id))
        .map(p => p.id);
      
      const finalDismissed = validDismissed.filter(id => !newLowStockIds.includes(id));
      
      if (finalDismissed.length !== parsedDismissed.length) {
        sessionStorage.setItem("dismissed_low_stock", JSON.stringify(finalDismissed));
      }
      setDismissed(finalDismissed);
    }
    
    previousLowStockIds.current = currentLowStockIds;
  }, [allLowStockProducts, isLoading, products.length]);

  const lowStockProducts = useMemo(() => {
    return allLowStockProducts.filter(p => !dismissed.includes(p.id));
  }, [allLowStockProducts, dismissed]);

  const dismissProduct = (id: number) => {
    const newDismissed = [...dismissed, id];
    setDismissed(newDismissed);
    sessionStorage.setItem("dismissed_low_stock", JSON.stringify(newDismissed));
  };

  const dismissAll = () => {
    const allIds = lowStockProducts.map((p) => p.id);
    const newDismissed = [...dismissed, ...allIds];
    setDismissed(newDismissed);
    sessionStorage.setItem("dismissed_low_stock", JSON.stringify(newDismissed));
  };

  if (lowStockProducts.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="mx-2 mb-3"
      >
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">
                {t("inventory.lowStockWarning", { count: lowStockProducts.length })}
              </span>
            </div>
            <button
              onClick={dismissAll}
              className="text-orange-600 hover:text-orange-800 p-1 rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            {lowStockProducts.slice(0, 5).map((product) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center justify-between bg-white rounded px-2 py-1.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-orange-600" />
                  <span className="font-medium">{product.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-700 font-bold">
                    {product.quantity} / {product.lowStockThreshold || 5}
                  </span>
                  <button
                    onClick={() => dismissProduct(product.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
            {lowStockProducts.length > 5 && (
              <p className="text-xs text-orange-600 text-center pt-1">
                +{lowStockProducts.length - 5} {t("common.more")}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
