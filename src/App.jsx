import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard/Dashboard";
import POSheet from "./pages/PO/POSheet";
import ABSReport from "./pages/ABSReport/ABSReport";
import "./App.css";

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/po/:id" element={<POSheet />} />
          <Route path="/abs" element={<ABSReport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}