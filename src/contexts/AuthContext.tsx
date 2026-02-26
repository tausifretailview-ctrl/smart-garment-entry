import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Global constants for cross-tab refresh coordination
const REFRESH_LOCK_KEY = 'auth_refresh_lock';
const REFRESH_COOLDOWN = 5000; // 5 seconds cooldown between refreshes
const SESSION_EXPIRY_BUFFER = 600; // 10 minutes buffer before expiry
const PERIODIC_CHECK_INTERVAL = 4 * 60 * 1000; // Check every 4 minutes

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

// Check if session needs refresh (within buffer OR already expired)
const isSessionNeedsRefresh = (session: Session | null): boolean => {
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
  
  // Use ref to track current session for visibility handler without triggering re-runs
  const sessionRef = useRef<Session | null>(null);
  
  // Keep sessionRef in sync with session state
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
        
        // Chrome-specific: refresh_token_not_found means the token was revoked
        // (tab suspension, bfcache, aggressive cleanup). Clean up locally.
        const errorMsg = (error.message || '').toLowerCase();
        if (errorMsg.includes('refresh_token_not_found') || errorMsg.includes('refresh token not found')) {
          console.warn("Refresh token revoked (common in Chrome). Clearing local session.");
          await supabase.auth.signOut({ scope: 'local' });
          localStorage.removeItem(REFRESH_LOCK_KEY);
          setSession(null);
          setUser(null);
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

  // Clear stale refresh locks on page load
  useEffect(() => {
    const lockValue = localStorage.getItem(REFRESH_LOCK_KEY);
    if (lockValue) {
      const lockTime = parseInt(lockValue, 10);
      // If lock is older than 30 seconds, it's definitely stale - clear it
      if (Date.now() - lockTime > 30000) {
        console.log("Clearing stale auth refresh lock");
        localStorage.removeItem(REFRESH_LOCK_KEY);
      }
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
        
        // Handle SIGNED_OUT triggered by refresh_token_not_found in Chrome
        // Preserve org slug so user lands on the correct org login page
        if (event === 'SIGNED_OUT') {
          const orgSlug = localStorage.getItem("selectedOrgSlug");
          if (orgSlug) {
            sessionStorage.setItem("selectedOrgSlug", orgSlug);
          }
        }
        
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      }
    );

    // Check for existing session with stale state recovery
    supabase.auth.getSession().then(async ({ data: { session: existingSession }, error }) => {
      // If there's an error getting session, try to refresh instead of signing out
      if (error) {
        console.warn("Error getting session, attempting refresh:", error);
        localStorage.removeItem(REFRESH_LOCK_KEY);
        try {
          const { data: refreshData } = await supabase.auth.refreshSession();
          if (refreshData.session) {
            setSession(refreshData.session);
            setUser(refreshData.session.user);
            setLoading(false);
            return;
          }
        } catch (refreshErr) {
          console.error("Refresh also failed:", refreshErr);
        }
        // Refresh failed - clean up stale tokens to prevent Chrome from caching bad state
        await supabase.auth.signOut({ scope: 'local' });
        localStorage.removeItem(REFRESH_LOCK_KEY);
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }
      
      // If session exists but is expired, try refresh before giving up
      if (existingSession && existingSession.expires_at) {
        const expiryTime = existingSession.expires_at;
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime > expiryTime) {
          console.warn("Session expired, attempting refresh...");
          localStorage.removeItem(REFRESH_LOCK_KEY);
          try {
            const { data: refreshData } = await supabase.auth.refreshSession();
            if (refreshData.session) {
              setSession(refreshData.session);
              setUser(refreshData.session.user);
              setLoading(false);
              return;
            }
          } catch (refreshErr) {
            console.error("Refresh failed for expired session:", refreshErr);
          }
          // Clean up stale local auth data (Chrome caches aggressively)
          await supabase.auth.signOut({ scope: 'local' });
          localStorage.removeItem(REFRESH_LOCK_KEY);
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }
      }
      
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setLoading(false);
    });

    // Visibility change handler - use ref to access current session without stale closure
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sessionRef.current && isSessionNeedsRefresh(sessionRef.current)) {
        console.log("App became visible and session needs refresh, refreshing...");
        safelyRefreshSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic session check to prevent expiry during long active usage
    const periodicCheck = setInterval(() => {
      if (document.visibilityState === 'visible' && sessionRef.current && isSessionNeedsRefresh(sessionRef.current)) {
        console.log("Periodic check: session needs refresh");
        safelyRefreshSession();
      }
    }, PERIODIC_CHECK_INTERVAL);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(periodicCheck);
    };
  }, [safelyRefreshSession]); // Remove session from deps - use ref instead

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
