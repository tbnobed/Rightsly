import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider } from '@/contexts/auth';
import { Shell } from '@/components/layouts/shell';
import NotFound from '@/pages/not-found';

// Pages
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import ContractsList from '@/pages/contracts/index';
import NewContractWizard from '@/pages/contracts/new';
import ContractDetail from '@/pages/contracts/detail';
import PartnersList from '@/pages/partners/index';
import PartnerDetail from '@/pages/partners/detail';
import ContentList from '@/pages/content/index';
import ContentDetail from '@/pages/content/detail';
import RightsCheck from '@/pages/rights-check';
import Royalties from '@/pages/royalties';
import Reports from '@/pages/reports';
import ImportData from '@/pages/import';
import AuditLog from '@/pages/audit-log';
import Users from '@/pages/users';
import AcceptInvite from '@/pages/accept-invite';
import ContactsList from '@/pages/contacts/index';
import { PwaInstallProvider } from '@/hooks/use-pwa-install';
import { PwaInstallBanner } from '@/components/pwa-install';
import { useAuth } from '@/contexts/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthenticatedRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#101e19] text-sm text-[#91a098]">
        Checking your session…
      </div>
    );
  }

  // AuthProvider updates the URL and removes rejected tokens. Rendering Login
  // here as well prevents a blank frame while that redirect effect completes.
  if (!user) return <Login />;

  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/contracts" component={ContractsList} />
        <Route path="/contracts/new" component={NewContractWizard} />
        <Route path="/contracts/:id/edit" component={NewContractWizard} />
        <Route path="/contracts/:id" component={ContractDetail} />
        <Route path="/partners" component={PartnersList} />
        <Route path="/partners/:id" component={PartnerDetail} />
        <Route path="/content" component={ContentList} />
        <Route path="/content/:id" component={ContentDetail} />
        <Route path="/rights-check" component={RightsCheck} />
        <Route path="/contacts" component={ContactsList} />
        <Route path="/royalties" component={Royalties} />
        <Route path="/reports" component={Reports} />
        <Route path="/import" component={ImportData} />
        <Route path="/audit-log" component={AuditLog} />
        <Route path="/users" component={Users} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function MainRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/accept-invite" component={AcceptInvite} />
      <Route component={AuthenticatedRouter} />
    </Switch>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AuthProvider>
          <PwaInstallProvider>
            <TooltipProvider>
              <MainRouter />
              <Toaster />
              <PwaInstallBanner />
            </TooltipProvider>
          </PwaInstallProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
