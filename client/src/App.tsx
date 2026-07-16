import React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import DashboardLayout from "./components/DashboardLayout";
import EmailComposer from "./pages/EmailComposer";
import SignatureEditor from "./pages/SignatureEditor";
import FollowUpReports from "./pages/FollowUpReports";
import CampaignTemplates from "./pages/CampaignTemplates";
import ScheduledEmails from "./pages/ScheduledEmails";
import Analytics from "./pages/Analytics";
import LeadSets from "./pages/LeadSets";
import CampaignDetail from "./pages/CampaignDetail";
import AllLeads from "./pages/Leads";
import Campaigns from "./pages/Campaigns";
import SettingsPage from "./pages/Settings";
import SocialOutreach from "./pages/SocialOutreach";
import MessageQueue from "./pages/MessageQueue";
import SearchPreview from "./pages/SearchPreview";
import Inbox from "./pages/Inbox";

// Wrapper to add DashboardLayout to pages
function WithLayout({ component: Component }: { component: React.ComponentType }) {
  return (
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/email-composer"}>{() => <WithLayout component={EmailComposer} />}</Route>
      <Route path={"/signature"}>{() => <WithLayout component={SignatureEditor} />}</Route>
      <Route path={"/follow-up-reports"}>{() => <WithLayout component={FollowUpReports} />}</Route>
      <Route path={"/templates"}>{() => <WithLayout component={CampaignTemplates} />}</Route>
      <Route path={"/scheduled-emails"} component={ScheduledEmails} />
      <Route path={"/analytics"}>{() => <WithLayout component={Analytics} />}</Route>
      <Route path={"/lead-sets"} component={LeadSets} />
      <Route path={"/all-leads"}>{() => <WithLayout component={AllLeads} />}</Route>
      <Route path={"/campaigns/:id"}>{() => <WithLayout component={CampaignDetail} />}</Route>
      <Route path={"/campaigns"}>{() => <WithLayout component={Campaigns} />}</Route>
      <Route path={"/inbox"}>{() => <WithLayout component={Inbox} />}</Route>
      <Route path={"/settings"}>{() => <WithLayout component={SettingsPage} />}</Route>
      <Route path={"/social-outreach"}>{() => <WithLayout component={SocialOutreach} />}</Route>
      <Route path={"/message-queue"}>{() => <WithLayout component={MessageQueue} />}</Route>
      <Route path={"/search-preview"}>{() => <WithLayout component={SearchPreview} />}</Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
