import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Global constants for cross-tab refresh coordination
const REFRESH_LOCK_KEY = 'auth_refresh_lock';
const REFRESH_COOLDOWN = 5000; // 5 seconds cooldown between refreshes
const SESSION_EXPIRY_BUFFER = 300; // 5 minutes buffer before expiry

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// Check if session is near expiry (within 5 minutes)
const isSessionNearExpiry = (session: Session | null): boolean => {
  if (!session?.expires_at) return false;
  const expiryTime = session.expires_at;
  const currentTime = Math.floor(Date.now() / 1000);
  return (expiryTime - currentTime) < SESSION_EXPIRY_BUFFER;
};

// Check if another tab/instance is currently refreshing
const isRefreshLocked = (): boolean => {
  const lockValue = localStorage.getItem(REFRESH_LOCK_KEY);
  if (!lockValue) return false;
  const lockTime = parseInt(lockValue, 10);
  return (Date.now() - lockTime) < REFRESH_COOLDOWN;
};

// Set the refresh lock
const setRefreshLock = () => {
  localStorage.setItem(REFRESH_LOCK_KEY, Date.now().toString());
};

// Clear the refresh lock
const clearRefreshLock = () => {
  localStorage.removeItem(REFRESH_LOCK_KEY);
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Controlled token refresh with global lock
  const safelyRefreshSession = useCallback(async () => {
    // Check if another instance is refreshing
    if (isRefreshLocked()) {
      console.log("Token refresh locked by another tab/instance");
      return;
    }

    // Set lock before refreshing
    setRefreshLock();

    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        // If it's a 429 error, don't clear the user state
        if (error.message?.includes('429') || error.status === 429) {
          console.log("Rate limited on token refresh, keeping existing session");
          return;
        }
        console.error("Token refresh error:", error);
      } else if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
      }
    } catch (err) {
      console.error("Unexpected error during token refresh:", err);
    } finally {
      // Clear lock after cooldown
      setTimeout(clearRefreshLock, REFRESH_COOLDOWN);
    }
  }, []);

  useEffect(() => {
    // Rate limit protection for token refresh
    let isRefreshing = false;
    let lastRefreshTime = 0;
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        // Prevent rapid token refresh cycles that can cause 429 errors
        if (event === 'TOKEN_REFRESHED') {
          const now = Date.now();
          
          // Check global lock across tabs
          if (isRefreshLocked()) {
            console.log("Skipping token refresh - locked by another tab");
            return;
          }
          
          // Check local instance cooldown
          if (isRefreshing || (now - lastRefreshTime < REFRESH_COOLDOWN)) {
            console.log("Skipping duplicate token refresh");
            return;
          }
          
          isRefreshing = true;
          lastRefreshTime = now;
          setTimeout(() => { isRefreshing = false; }, REFRESH_COOLDOWN);
        }
        
        // If token refresh resulted in null session but we had one before,
        // this might be a 429 error - don't immediately clear the user
        if (event === 'TOKEN_REFRESHED' && !currentSession && session) {
          console.log("Token refresh returned null session, keeping existing session");
          return;
        }
        
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setLoading(false);
    });

    // Visibility change handler - only refresh when becoming visible and session is near expiry
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && session && isSessionNearExpiry(session)) {
        console.log("App became visible and session near expiry, refreshing...");
        safelyRefreshSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, safelyRefreshSession]);

  const signOut = async () => {
    // Store org slug before signing out for PWA recovery
    const orgSlug = localStorage.getItem("selectedOrgSlug");
    if (orgSlug) {
      sessionStorage.setItem("selectedOrgSlug", orgSlug);
    }
    
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
