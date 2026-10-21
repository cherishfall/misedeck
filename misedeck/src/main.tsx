import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";

// Self-hosted webfonts first: the @font-face rules must be registered
// before tokens.css asks for the families (issue #241). Both are local —
// the app's CSP is `default-src 'self'`, which is why the remote Google
// Fonts link could never load.
import "./fonts.css";
import "./tokens.css";
import "./i18n";
import { LanguageProvider } from "./i18n/useLanguage";
import { ThemeProvider } from "./state/themeContext";
import { DirectoryProvider } from "./state/directoryContext";
import { TrustProvider } from "./state/trustContext";
import { ActivationProvider } from "./state/activationContext";
import { ExecutionProvider } from "./components/ExecutionPanel";
import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary";
import { PageRefreshProvider } from "./components/PageShell/pageRefresh";
import { HomePage } from "./pages/HomePage/HomePage";
import { ToolsPage } from "./pages/ToolsPage/ToolsPage";
import { DirectoryPreview } from "./pages/DirectoryPreview/DirectoryPreview";
import { EnvPage } from "./pages/EnvPage/EnvPage";
import { TasksPage } from "./pages/TasksPage/TasksPage";
import { SettingsPage } from "./pages/SettingsPage/SettingsPage";
import { DoctorPage } from "./pages/DoctorPage/DoctorPage";
import { PluginsPage } from "./pages/PluginsPage/PluginsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

/** Root render-failure net (issue #214). It sits inside the providers
 *  and the router so the fallback can use i18n, the theme, the
 *  directory context, and the shell chrome; `resetKey` clears a caught
 *  error on navigation, which is what makes the fallback's sidebar
 *  links live instead of dead. */
function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <DirectoryProvider>
          <TrustProvider>
            <ActivationProvider>
              <ExecutionProvider>
                <BrowserRouter>
                  {/* PageRefreshProvider sits above the router because each
                      page renders PageShell inside itself — a provider owned
                      by PageShell would be a descendant of the page that
                      registers (issue #130). */}
                  <PageRefreshProvider>
                    <RoutedErrorBoundary>
                      <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/tools" element={<ToolsPage />} />
                        <Route path="/tasks" element={<TasksPage />} />
                        <Route path="/preview" element={<DirectoryPreview />} />
                        <Route path="/env" element={<EnvPage />} />
                        {/* The Config editor page is retired (#43): [tools]
                            editing lives on Tools, [env] editing on Env, and
                            config-file visibility on Preview. The old route
                            still redirects, kept for old-link compatibility
                            (product-logic — retained, no removal planned). */}
                        <Route path="/config" element={<Navigate to="/preview" replace />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/doctor" element={<DoctorPage />} />
                        <Route path="/plugins" element={<PluginsPage />} />
                      </Routes>
                    </RoutedErrorBoundary>
                  </PageRefreshProvider>
                </BrowserRouter>
              </ExecutionProvider>
            </ActivationProvider>
          </TrustProvider>
        </DirectoryProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
