import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";

import "./tokens.css";
import "./i18n";
import { LanguageProvider } from "./i18n/useLanguage";
import { DirectoryProvider } from "./state/directoryContext";
import { ExecutionProvider } from "./components/ExecutionPanel";
import App from "./App";
import { StyleGuide } from "./components/StyleGuide/StyleGuide";
import { ToolsPage } from "./pages/ToolsPage/ToolsPage";

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
          <ExecutionProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<App />} />
                <Route path="/tools" element={<ToolsPage />} />
                <Route path="/__styleguide" element={<StyleGuide />} />
              </Routes>
            </BrowserRouter>
          </ExecutionProvider>
        </DirectoryProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
