import { useCallback } from 'react';

export const useClearCache = () => {
  const clearAllCaches = useCallback(async () => {
    try {
      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      
      // Clear cache storage
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      // Clear localStorage except essential keys
      const essentialKeys = ['selectedOrgSlug', 'supabase.auth'];
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !essentialKeys.some(ek => key.includes(ek))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      return true;
    } catch (error) {
      console.error('Error clearing caches:', error);
      return false;
    }
  }, []);

  const clearAndReload = useCallback(async () => {
    await clearAllCaches();
    window.location.reload();
  }, [clearAllCaches]);

  return { clearAllCaches, clearAndReload };
};
