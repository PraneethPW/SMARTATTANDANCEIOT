import { ArrowLeft, House, LogOut } from "lucide-react";

export default function DashboardNavigation({
  onBack,
  onHome,
  onLogout,
}: {
  onBack: () => void;
  onHome: () => void;
  onLogout: () => void;
}) {
  return (
    <nav className="dashboard-navigation" aria-label="Dashboard navigation">
      <button type="button" onClick={onBack} title="Go back, or return home">
        <ArrowLeft size={15} aria-hidden="true" /> Back
      </button>
      <button type="button" onClick={onHome} title="Go to the landing page">
        <House size={15} aria-hidden="true" /> Home
      </button>
      <button type="button" onClick={onLogout}>
        <LogOut size={15} aria-hidden="true" /> Sign out
      </button>
    </nav>
  );
}
