import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EventProvider } from "@/context/EventContext";
import { initTheme } from "@/components/ThemeToggle";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import SponsorReport from "./pages/SponsorReport.tsx";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    initTheme();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <EventProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/informe/:token" element={<SponsorReport />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </EventProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
