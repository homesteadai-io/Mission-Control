import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { PetApp } from "./components/PetApp";
import "./styles/app.css";

// The pet overlay window loads the same bundle with #pet — a second tiny
// window of the same app, not a second app.
const isPetWindow = window.location.hash === "#pet";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isPetWindow ? <PetApp /> : <App />}</React.StrictMode>
);
