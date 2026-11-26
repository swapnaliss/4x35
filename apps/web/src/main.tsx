import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EmptyState } from "./components/EmptyState";
import { t } from "./i18n";
import "./styles/app.css";

// Production entry. M1-07 replaces this placeholder with the router and the first screens.
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <main className="mx-auto max-w-3xl p-6">
        <EmptyState
          headingLevel={1}
          title={t("app.placeholder.title")}
          body={t("app.placeholder.body")}
        />
      </main>
    </StrictMode>,
  );
}
