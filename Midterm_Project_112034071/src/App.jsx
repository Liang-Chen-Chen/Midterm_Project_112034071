import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/Authentication";
import AuthPage from "./pages/LoginPage";
import Sidebar from "./component/Sidebar";
import ChatArea from "./component/Chat";
import "./App.css";

function AppInner() {
  const { user } = useAuth();
  const [activeRoom, setActiveRoom] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Request Chrome notification permission on first login
  useEffect(() => {
    if (!user) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") showToast("🔔 Notifications enabled!");
      });
    }
  }, [user]);

  function showToast(msg, duration = 3000) {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }

  if (!user) return <AuthPage />;

  return (
    <div className="app-layout">
      {/* Sidebar backdrop (mobile) */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <Sidebar
          activeRoom={activeRoom}
          onSelectRoom={(room) => {
            setActiveRoom(room);
            setSearchOpen(false);
          }}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Chat area */}
      <ChatArea
        room={activeRoom}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onSearchOpen={() => setSearchOpen((v) => !v)}
        searchOpen={searchOpen}
      />

      {/* Toast notification */}
      {toast && <div className="toast animate-fadeIn">{toast}</div>}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
