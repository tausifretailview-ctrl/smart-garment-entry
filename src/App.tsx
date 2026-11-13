import { useState, Suspense } from "react";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { readPersistCacheCharLength } from "@/lib/queryPersister";
import { markPersistRestoreComplete } from "@/lib/mainThreadViolationProbe";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { WindowTabsProvider } from "@/contexts/WindowTabsContext";
import { NativeAppBridge } from "@/components/NativeAppBridge";
import { OwnerPushBridge } from "@/components/OwnerPushBridge";
import { AppUpdatePrompt } from "@/components/AppUpdatePrompt";
import { ClockSkewWarning } from "@/components/ClockSkewWarning";
import { NavigationPerfPanel } from "@/components/NavigationPerfPanel";
import { ElectronOAuthRecovery } from "@/components/ElectronOAuthRecovery";
import { DesktopHintBar } from "@/components/desktop/DesktopHintBar";
import { SuspensionGate } from "@/components/SuspensionGate";
import { appPersistOptions, createAppQueryClient } from "@/app/appQueryClient";
import { cleanupCorruptedAuthTokens, useAppStartupEffects } from "@/app/appStartup";
import { LazyFallback } from "@/app/LazyFallback";
import { AppRoutes } from "@/app/AppRoutes";

/**
 * The app shell: providers around the route tree. Pages and routes live in
 * src/app/AppRoutes.tsx + lazyPages.ts, the query client in appQueryClient.ts and
 * start-up work in appStartup.ts (Plan Phase 4, S3).
 */

// Before React mounts, as before.
cleanupCorruptedAuthTokens();

const App = () => {
  useAppStartupEffects();
  const [queryClient] = useState(createAppQueryClient);

  return (
    <RootErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={appPersistOptions}
      onSuccess={() => {
        void readPersistCacheCharLength().then((chars) => {
          markPersistRestoreComplete(chars);
        });
        void queryClient.resumePausedMutations();
      }}
    >
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ElectronOAuthRecovery />
        <DesktopHintBar />
        <NativeAppBridge />
        <AuthProvider>
          <OrganizationProvider>
            <AppUpdatePrompt />
            <ClockSkewWarning />
            <OwnerPushBridge />
            <WindowTabsProvider>
            <Suspense fallback={<LazyFallback />}>
            <SuspensionGate>
            <AppRoutes />
            </SuspensionGate>
            </Suspense>
            </WindowTabsProvider>
          </OrganizationProvider>
        </AuthProvider>
        <NavigationPerfPanel />
      </BrowserRouter>
    </TooltipProvider>
    </PersistQueryClientProvider>
    </ThemeProvider>
    </RootErrorBoundary>
  );
};


export default App;

