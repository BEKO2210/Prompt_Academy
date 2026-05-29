import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App";
import { Landing } from "./pages/Landing";
import { Library } from "./pages/Library";
import { Impressum, Datenschutz } from "./pages/legal";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        { index: true, element: <Landing /> },
        { path: "library", element: <Library /> },
        { path: "impressum", element: <Impressum /> },
        { path: "datenschutz", element: <Datenschutz /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
