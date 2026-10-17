import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/noto-sans-kr";
import App from "./App";
import { BrowserRouter, useLocation } from "react-router-dom";
import "./styles.css";
import "./community.css";
import "./planner/planner.css";
import { I18nProvider } from "./i18n";
import { readAuthCallback } from "./supabase";
const LandingPage = React.lazy(() => import("./LandingPage"));
const SharedItineraryPage = React.lazy(
  () => import("./planner/SharedItineraryPage"),
);
const LegalSitePage = React.lazy(() => import("./LegalSitePage"));
const TestCheckout = React.lazy(() => import("./checkout/TestCheckout"));
function SiteRouter() {
  const location = useLocation();
  // Keep the existing App mounted while it scrubs a root callback URL and
  // navigates to recovery. Switching to the landing midway loses recovery state.
  const [rootAuthHandoff, setRootAuthHandoff] = React.useState(
    () =>
      window.location.pathname === "/" &&
      readAuthCallback(window.location.href).present,
  );
  React.useEffect(() => {
    if (location.pathname !== "/") setRootAuthHandoff(false);
  }, [location.pathname]);
  if (
    location.pathname === "/" &&
    !rootAuthHandoff &&
    !readAuthCallback(window.location.href).present
  )
    return (
      <React.Suspense fallback={<p role="status">LocalRoute…</p>}>
        <LandingPage />
      </React.Suspense>
    );
  if (location.pathname === "/checkout/test")
    return (
      <React.Suspense fallback={<p role="status">LocalRoute…</p>}>
        <TestCheckout />
      </React.Suspense>
    );
  if (location.pathname.startsWith("/legal/"))
    return (
      <React.Suspense fallback={<p role="status">LocalRoute…</p>}>
        <LegalSitePage />
      </React.Suspense>
    );
  return location.pathname.startsWith("/s/") ? (
    <React.Suspense fallback={<p role="status">LocalRoute…</p>}>
      <SharedItineraryPage />
    </React.Suspense>
  ) : (
    <App />
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <SiteRouter />
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
import "./planner/reference.css";
