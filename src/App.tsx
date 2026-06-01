import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";

import { Main } from "./pages/main/main";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/main" replace />} />
        <Route path="/main" element={<Main />} />
      </Routes>
    </BrowserRouter>
  );
}
