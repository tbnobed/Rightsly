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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthenticatedRouter() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/contracts" component={ContractsList} />
        <Route path="/contracts/new" component={NewContractWizard} />
        <Route path="/contracts/:id" component={ContractDetail} />
        <Route path="/partners" component={PartnersList} />
        <Route path="/partners/:id" component={PartnerDetail} />
        <Route path="/content" component={ContentList} />
        <Route path="/content/:id" component={ContentDetail} />
        <Route path="/rights-check" component={RightsCheck} />
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
      <Route component={AuthenticatedRouter} />
    </Switch>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AuthProvider>
          <TooltipProvider>
            <MainRouter />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
