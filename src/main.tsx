import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/noto-sans-kr";
import App from "./App";
import "./styles.css";
import "./community.css";
import "./planner/planner.css";
import { I18nProvider } from "./i18n";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);

import "./planner/reference.css";
