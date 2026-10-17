// Browser fixture only. Vite's production entry does not import this file.
import { createRoot } from "react-dom/client";
import { BookingButton } from "../src/booking/BookingButton";
import { createBookingApi } from "../src/booking/api";
import "../src/styles.css";
const api = createBookingApi(async () => "test-only");
createRoot(document.getElementById("root")!).render(
  <main style={{ maxWidth: 500, margin: "auto", padding: 8 }}>
    <BookingButton
      api={api}
      placeId="70000000-0000-4000-8000-000000000003"
      language={
        new URLSearchParams(location.search).get("lang") === "en" ? "en" : "ko"
      }
    />
  </main>,
);
