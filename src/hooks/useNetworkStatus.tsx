import { useState, useEffect } from "react";

interface NetworkStatus {
  isOnline: boolean;
  isSlowConnection: boolean;
  effectiveType: string | null;
}

export const useNetworkStatus = (): NetworkStatus => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [effectiveType, setEffectiveType] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check connection speed if Network Information API is available
    const connection = (navigator as any).connection || 
                       (navigator as any).mozConnection || 
                       (navigator as any).webkitConnection;
    
    if (connection) {
      const checkSpeed = () => {
        const type = connection.effectiveType;
        setEffectiveType(type);
        setIsSlowConnection(
          type === "slow-2g" || 
          type === "2g" || 
          type === "3g"
        );
      };

      connection.addEventListener("change", checkSpeed);
      checkSpeed();

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        connection.removeEventListener("change", checkSpeed);
      };
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, isSlowConnection, effectiveType };
};
