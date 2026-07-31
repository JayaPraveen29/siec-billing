import { NavLink } from "react-router-dom";
import { LayoutGrid, FileSpreadsheet } from "lucide-react";

const linkBase =
  "flex items-center gap-3 px-4 py-2.5 rounded-sm text-sm font-body transition border-l-2";

export default function Sidebar() {
  return (
    <aside className="w-64 shrink-0 bg-plate border-r border-line flex flex-col h-screen sticky top-0">
      <div className="px-5 py-6 border-b border-line">
        <div className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 32 32" className="text-rivet">
            <path d="M4 8H28V12H18V20H28V24H4V20H14V12H4Z" fill="currentColor" />
          </svg>
          <span className="font-display text-xl tracking-wide">SIEC LEDGER</span>
        </div>
        <div className="text-[11px] text-muted mt-1 tracking-widest uppercase font-mono">
          PO &amp; Billing System
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `${linkBase} ${
              isActive
                ? "border-rivet bg-plate2 text-paper"
                : "border-transparent text-muted hover:text-paper hover:bg-plate2"
            }`
          }
        >
          <LayoutGrid size={17} />
          PO Sheets
        </NavLink>
        <NavLink
          to="/abs"
          className={({ isActive }) =>
            `${linkBase} ${
              isActive
                ? "border-rivet bg-plate2 text-paper"
                : "border-transparent text-muted hover:text-paper hover:bg-plate2"
            }`
          }
        >
          <FileSpreadsheet size={17} />
          ABS Report
        </NavLink>
      </nav>

    </aside>
  );
}
