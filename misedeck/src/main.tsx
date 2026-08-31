import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";

import "./tokens.css";
import "./i18n";
import { LanguageProvider } from "./i18n/useLanguage";
import { DirectoryProvider } from "./state/directoryContext";
import { TrustProvider } from "./state/trustContext";
import { ExecutionProvider } from "./components/ExecutionPanel";
import App from "./App";
import { StyleGuide } from "./components/StyleGuide/StyleGuide";
import { ToolsPage } from "./pages/ToolsPage/ToolsPage";
import { DirectoryPreview } from "./pages/DirectoryPreview/DirectoryPreview";

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
        <DirectoryProvider>
          <TrustProvider>
            <ExecutionProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<App />} />
                  <Route path="/tools" element={<ToolsPage />} />
                  <Route path="/preview" element={<DirectoryPreview />} />
                  <Route path="/__styleguide" element={<StyleGuide />} />
                </Routes>
              </BrowserRouter>
            </ExecutionProvider>
          </TrustProvider>
        </DirectoryProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
