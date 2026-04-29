import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { CountryFilterProvider } from "@/hooks/useCountryFilter";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import ResetPasswordRequest from "@/pages/ResetPasswordRequest";
import UpdatePassword from "@/pages/UpdatePassword";
import RapportDuJour from "@/pages/RapportDuJour";
import Creances from "@/pages/Creances";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Historique from "@/pages/Historique";
import FacturesReglees from "@/pages/FacturesReglees";
import Pertes from "@/pages/Pertes";
import UserManagement from "@/pages/UserManagement";
import NotFound from "@/pages/NotFound";
import { RequireAdmin } from "@/components/RequireAdmin";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Chargement...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <CountryFilterProvider>
    <AppLayout>
      <Routes>
        <Route path="/" element={<RapportDuJour />} />
        <Route path="/creances" element={<Creances />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/factures-reglees" element={<FacturesReglees />} />
        <Route path="/pertes" element={<Pertes />} />
        <Route path="/historique" element={<Historique />} />
        <Route path="/users" element={<RequireAdmin><UserManagement /></RequireAdmin>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
    </CountryFilterProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ResetPasswordRequest />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/set-password" element={<UpdatePassword />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
