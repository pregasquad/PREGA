import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLock } from "@/components/layout/AdminLock";

import Home from "@/pages/Home";
import Planning from "@/pages/Planning";
import Services from "@/pages/Services";
import Reports from "@/pages/Reports";
import Inventory from "@/pages/Inventory";
import Charges from "@/pages/Charges";
import Salaries from "@/pages/Salaries";
import Booking from "@/pages/Booking";
import NotFound from "@/pages/not-found";

// Wrapper for pages with layout
function PageRoute({ component: Component, requireAdmin = false }: { component: React.ComponentType, requireAdmin?: boolean }) {
  const content = (
    <AppLayout>
      <Component />
    </AppLayout>
  );

  if (requireAdmin) {
    return <AdminLock>{content}</AdminLock>;
  }

  return content;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <PageRoute component={Home} requireAdmin />
      </Route>

      <Route path="/planning">
        <PageRoute component={Planning} />
      </Route>
      
      <Route path="/services">
        <PageRoute component={Services} requireAdmin />
      </Route>
      
      <Route path="/reports">
        <PageRoute component={Reports} requireAdmin />
      </Route>

      <Route path="/inventory">
        <PageRoute component={Inventory} requireAdmin />
      </Route>

      <Route path="/charges">
        <PageRoute component={Charges} />
      </Route>

      <Route path="/salaries">
        <PageRoute component={Salaries} requireAdmin />
      </Route>

      <Route path="/booking" component={Booking} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
