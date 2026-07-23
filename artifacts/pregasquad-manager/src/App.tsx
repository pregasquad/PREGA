import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLock } from "@/components/layout/AdminLock";
import { FirstLogin } from "@/components/layout/FirstLogin";
import { Suspense, lazy, useEffect, Component, type ReactNode } from "react";
import { useBusinessSettings } from "@/hooks/use-salon-data";
import { SpinningLogo } from "@/components/ui/spinning-logo";
import { initGA } from "./lib/analytics";
import { useAnalytics } from "./hooks/use-analytics";
import { connectQz, initPrintSocket, isQzConnected } from "./lib/qzPrint";
import { saveSalariesCache } from "./lib/offlineDb";
import { prefetchCoreData } from "./lib/queryClient";

// All pages lazy-loaded so a single page error never blanks the whole app
const Planning = lazy(() => import("@/pages/Planning"));
const Booking = lazy(() => import("@/pages/Booking"));
const MyBookings = lazy(() => import("@/pages/MyBookings"));
const Charges = lazy(() => import("@/pages/Charges"));
const Home = lazy(() => import("@/pages/Home"));
const Services = lazy(() => import("@/pages/Services"));
const Reports = lazy(() => import("@/pages/Reports"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const Salaries = lazy(() => import("@/pages/Salaries"));
const StaffCommissions = lazy(() => import("@/pages/StaffCommissions"));
const Clients = lazy(() => import("@/pages/Clients"));
const StaffPerformance = lazy(() => import("@/pages/StaffPerformance"));
const Staff = lazy(() => import("@/pages/Staff"));
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const WhatsApp = lazy(() => import("@/pages/WhatsApp"));
const Logs = lazy(() => import("@/pages/Logs"));
const LoyaltyRewards = lazy(() => import("@/pages/LoyaltyRewards"));
const Packages = lazy(() => import("@/pages/Packages"));
const BookingHistory = lazy(() => import("@/pages/BookingHistory"));
const NotFound = lazy(() => import("@/pages/not-found"));
const StaffPortal = lazy(() => import("@/pages/StaffPortal"));
const Tombola = lazy(() => import("@/pages/Tombola"));
const POS = lazy(() => import("@/pages/POS"));
const Website = lazy(() => import("@/pages/Website1"));

// Applies body-level user-select based on the allowTextSelection setting
function GlobalStyleApplier() {
  const { data: businessSettings } = useBusinessSettings();
  useEffect(() => {
    const allow = businessSettings?.allowTextSelection ?? false;
    if (allow) {
      document.body.classList.remove('no-text-select');
    } else {
      document.body.classList.add('no-text-select');
    }
  }, [businessSettings?.allowTextSelection]);
  return null;
}

function PageLoader() {
  return (
    <div className="loading-container min-h-[60vh] page-wrapper">
      <SpinningLogo size="lg" />
    </div>
  );
}

function PageContent({ children }: { children: React.ReactNode }) {
  return <div className="page-content h-full flex flex-col min-h-0">{children}</div>;
}

// Global error boundary — catches any render crash and shows a message instead of blank page
interface ErrorBoundaryState { error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-8">
          <div className="max-w-lg w-full rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-bold text-destructive">حدث خطأ في التطبيق</h1>
            <p className="text-sm text-muted-foreground font-mono break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
              className="px-6 py-2 rounded-xl bg-primary text-white font-medium hover:opacity-90 transition"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PermissionGuard({ children, permission }: { children: React.ReactNode, permission?: string }) {
  if (!permission) return <>{children}</>;
  
  const currentUserName = typeof window !== 'undefined' ? sessionStorage.getItem("current_user") : null;
  if (!currentUserName || currentUserName === "Setup") return <>{children}</>;
  
  const currentUserRole = typeof window !== 'undefined' ? sessionStorage.getItem("current_user_role") : null;
  if (currentUserRole === "owner") return <>{children}</>;
  
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

function PageRoute({ component: Component, requireAdmin = false, permission }: { component: React.ComponentType, requireAdmin?: boolean, permission?: string }) {
  const pageContent = (
    <Suspense fallback={<PageLoader />}>
      <ErrorBoundary>
        <PageContent>
          <Component />
        </PageContent>
      </ErrorBoundary>
    </Suspense>
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
  useAnalytics();
  
  return (
    <Switch>
      <Route path="/">
        <PageRoute component={Planning} permission="view_planning" />
      </Route>

      <Route path="/home">
        <PageRoute component={Home} permission="view_home" />
      </Route>

      <Route path="/planning">
        <PageRoute component={Planning} permission="view_planning" />
      </Route>

      <Route path="/services">
        <PageRoute component={Services} requireAdmin permission="view_services" />
      </Route>

      <Route path="/reports">
        <PageRoute component={Reports} requireAdmin permission="view_reports" />
      </Route>

      <Route path="/inventory">
        <PageRoute component={Inventory} requireAdmin permission="view_inventory" />
      </Route>

      <Route path="/charges">
        <PageRoute component={Charges} permission="view_expenses" />
      </Route>

      <Route path="/salaries">
        <PageRoute component={Salaries} requireAdmin permission="view_salaries" />
      </Route>

      <Route path="/staff-commissions">
        <PageRoute component={StaffCommissions} requireAdmin permission="manage_salaries" />
      </Route>

      <Route path="/clients">
        <PageRoute component={Clients} requireAdmin permission="view_clients" />
      </Route>

      <Route path="/staff-performance">
        <PageRoute component={StaffPerformance} requireAdmin permission="view_staff_performance" />
      </Route>

      <Route path="/staff">
        <PageRoute component={Staff} requireAdmin permission="manage_staff" />
      </Route>

      <Route path="/whatsapp">
        <PageRoute component={WhatsApp} requireAdmin permission="admin_settings" />
      </Route>

      <Route path="/logs">
        <PageRoute component={Logs} requireAdmin permission="admin_settings" />
      </Route>

      <Route path="/admin-settings">
        <PageRoute component={AdminSettings} requireAdmin permission="admin_settings" />
      </Route>

      <Route path="/loyalty-rewards">
        <PageRoute component={LoyaltyRewards} requireAdmin permission="manage_business_settings" />
      </Route>

      <Route path="/packages">
        <PageRoute component={Packages} requireAdmin permission="manage_services" />
      </Route>

      <Route path="/booking-history">
        <PageRoute component={BookingHistory} permission="view_booking_history" />
      </Route>

      <Route path="/pos">
        <PageRoute component={POS} permission="manage_appointments" />
      </Route>

      <Route path="/website">
        <Suspense fallback={<PageLoader />}>
          <Website />
        </Suspense>
      </Route>

      <Route path="/tombola">
        <Suspense fallback={<PageLoader />}>
          <Tombola />
        </Suspense>
      </Route>

      <Route path="/booking">
        <Suspense fallback={<PageLoader />}>
          <Booking />
        </Suspense>
      </Route>

      <Route path="/my-bookings">
        <Suspense fallback={<PageLoader />}>
          <MyBookings />
        </Suspense>
      </Route>

      <Route path="/staff-portal/:token">
        <Suspense fallback={<PageLoader />}>
          <StaffPortal />
        </Suspense>
      </Route>

      <Route>
        <Suspense fallback={<PageLoader />}>
          <NotFound />
        </Suspense>
      </Route>
    </Switch>
  );
}

function App() {
  useEffect(() => {
    if (import.meta.env.VITE_GA_MEASUREMENT_ID) {
      initGA();
    }
    initPrintSocket();
    connectQz().catch(() => {});

    // Retry QZ connection every 30s when not connected (keeps laptop registered as print station)
    const qzRetry = setInterval(() => {
      if (!isQzConnected()) {
        connectQz().catch(() => {});
      }
    }, 30000);

    const isAuth = sessionStorage.getItem("user_authenticated") === "true" ||
                   localStorage.getItem("user_authenticated") === "true";
    if (isAuth) {
      // Seed all core data caches with one request so every page loads instantly
      prefetchCoreData().catch(() => {});

      // Prefetch salaries in parallel
      fetch("/api/salaries/compute", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            queryClient.setQueryData(["/api/salaries/compute"], data);
            saveSalariesCache(data).catch(() => {});
          }
        })
        .catch(() => {});
    }

    return () => clearInterval(qzRetry);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <GlobalStyleApplier />
          <Toaster />
          <ErrorBoundary>
            <FirstLogin>
              <Router />
            </FirstLogin>
          </ErrorBoundary>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
