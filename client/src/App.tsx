import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLock } from "@/components/layout/AdminLock";
import { FirstLogin } from "@/components/layout/FirstLogin";
import { Suspense, lazy } from "react";
import { SpinningLogo } from "@/components/ui/spinning-logo";

// Core pages - loaded immediately
import Planning from "@/pages/Planning";
import Booking from "@/pages/Booking";
import Charges from "@/pages/Charges";

// Admin pages - lazy loaded for faster initial load
const Home = lazy(() => import("@/pages/Home"));
const Services = lazy(() => import("@/pages/Services"));
const Reports = lazy(() => import("@/pages/Reports"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const Salaries = lazy(() => import("@/pages/Salaries"));
const Clients = lazy(() => import("@/pages/Clients"));
const StaffPerformance = lazy(() => import("@/pages/StaffPerformance"));
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <SpinningLogo size="lg" />
    </div>
  );
}

function PermissionGuard({ children, permission }: { children: React.ReactNode, permission?: string }) {
  if (!permission) return <>{children}</>;
  
  const currentUserName = typeof window !== 'undefined' ? sessionStorage.getItem("current_user") : null;
  if (!currentUserName || currentUserName === "Setup") return <>{children}</>;
  
  const storedPermissions = typeof window !== 'undefined' ? sessionStorage.getItem("current_user_permissions") : null;
  if (!storedPermissions) return <>{children}</>;
  
  try {
    const permissions = JSON.parse(storedPermissions) as string[];
    if (permissions.length === 0) return <>{children}</>;
    
    if (!permissions.includes(permission)) {
      return (
        <AppLayout>
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
            <div className="p-4 rounded-full bg-destructive/10 mb-4">
              <svg className="w-12 h-12 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
          </div>
        </AppLayout>
      );
    }
  } catch {
    return <>{children}</>;
  }
  
  return <>{children}</>;
}

// Wrapper for pages with layout
function PageRoute({ component: Component, requireAdmin = false, permission, lazy: isLazy = false }: { component: React.ComponentType, requireAdmin?: boolean, permission?: string, lazy?: boolean }) {
  const pageContent = isLazy ? (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  ) : (
    <Component />
  );

  const content = (
    <AppLayout>
      {pageContent}
    </AppLayout>
  );

  const guardedContent = permission ? <PermissionGuard permission={permission}>{content}</PermissionGuard> : content;

  if (requireAdmin) {
    return <AdminLock>{guardedContent}</AdminLock>;
  }

  return guardedContent;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <PageRoute component={Planning} permission="view_planning" />
      </Route>

      <Route path="/home">
        <PageRoute component={Home} permission="view_home" lazy />
      </Route>

      <Route path="/planning">
        <PageRoute component={Planning} permission="view_planning" />
      </Route>

      <Route path="/services">
        <PageRoute component={Services} requireAdmin permission="view_services" lazy />
      </Route>

      <Route path="/reports">
        <PageRoute component={Reports} requireAdmin permission="view_reports" lazy />
      </Route>

      <Route path="/inventory">
        <PageRoute component={Inventory} requireAdmin permission="view_inventory" lazy />
      </Route>

      <Route path="/charges">
        <PageRoute component={Charges} permission="view_expenses" />
      </Route>

      <Route path="/salaries">
        <PageRoute component={Salaries} requireAdmin permission="view_salaries" lazy />
      </Route>

      <Route path="/clients">
        <PageRoute component={Clients} requireAdmin permission="view_clients" lazy />
      </Route>

      <Route path="/staff-performance">
        <PageRoute component={StaffPerformance} requireAdmin permission="view_staff_performance" lazy />
      </Route>

      <Route path="/admin-settings">
        <PageRoute component={AdminSettings} requireAdmin permission="admin_settings" lazy />
      </Route>

      <Route path="/booking" component={Booking} />

      <Route>
        <Suspense fallback={<PageLoader />}>
          <NotFound />
        </Suspense>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <FirstLogin>
          <Router />
        </FirstLogin>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
