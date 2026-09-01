import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import "./tokens.css";
import "./i18n";
import { LanguageProvider } from "./i18n/useLanguage";
import { ThemeProvider } from "./state/themeContext";
import { DirectoryProvider } from "./state/directoryContext";
import { TrustProvider } from "./state/trustContext";
import { ActivationProvider } from "./state/activationContext";
import { ExecutionProvider } from "./components/ExecutionPanel";
import { StyleGuide } from "./components/StyleGuide/StyleGuide";
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
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/tools" element={<ToolsPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/preview" element={<DirectoryPreview />} />
                    <Route path="/env" element={<EnvPage />} />
                    {/* The Config editor page is retired (#43): [tools]
                        editing lives on Tools, [env] editing on Env, and
                        config-file visibility on Preview. Redirect the old
                        route for one release. */}
                    <Route path="/config" element={<Navigate to="/preview" replace />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/doctor" element={<DoctorPage />} />
                    <Route path="/plugins" element={<PluginsPage />} />
                    {/* Styleguide is internal design documentation (#36):
                        dev builds only, never shipped in the product UI. */}
                    {import.meta.env.DEV && (
                      <Route path="/__styleguide" element={<StyleGuide />} />
                    )}
                  </Routes>
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
