import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "./firebase";
import { AuthProvider, useAuth } from "./context/Authentication";
import AuthPage from "./pages/LoginPage";
import Sidebar from "./component/Sidebar";
import ChatArea from "./component/Chat";
import "./App.css";

// ─── Custom hook: manages all room subscriptions, unread badges, and notifications ───
function useRoomManager(user, currentRoomId) {
  const [rooms, setRooms] = useState([]);
  const [badges, setBadges] = useState({});       // { roomId: unreadCount }
  const viewedAt = useRef({});                     // { roomId: timestamp }

  // Subscribe to rooms the user belongs to
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "rooms"), where("members", "array-contains", user.uid));
    return onSnapshot(q, (snap) => {
      const fetched = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRooms(fetched);
    });
  }, [user]);

  // Per-room message listener → unread count + desktop notifications
  useEffect(() => {
    if (!user || rooms.length === 0) return;

    const teardowns = rooms.map((room) => {
      const msgQuery = query(
        collection(db, "rooms", room.id, "messages"),
        orderBy("createdAt", "desc"),
        limit(50)
      );

      return onSnapshot(msgQuery, (snap) => {
        const lastViewed = viewedAt.current[room.id] ?? 0;

        const unread = snap.docs.filter((d) => {
          const { senderId, unsent, createdAt } = d.data();
          if (senderId === user.uid || unsent) return false;
          return (createdAt?.toMillis?.() ?? 0) > lastViewed;
        });

        setBadges((prev) => ({ ...prev, [room.id]: unread.length }));

        // Fire desktop notification for messages in other rooms
        snap.docChanges().forEach((change) => {
          if (change.type !== "added") return;
          const { senderId, unsent, createdAt, text } = change.doc.data();
          if (senderId === user.uid || unsent) return;
          if (room.id === currentRoomId) return;
          if (change.doc.metadata.hasPendingWrites) return;

          const messageAge = Date.now() - (createdAt?.toMillis?.() ?? Date.now());
          if (messageAge > 15000) return;

          if (Notification.permission === "granted") {
            new Notification(`💬 ${room.name}`, {
              body: text || "📷 Image",
              icon: "/favicon.svg",
            });
          }
        });
      });
    });

    return () => teardowns.forEach((fn) => fn());
  }, [user, rooms, currentRoomId]);

  function markRead(roomId) {
    viewedAt.current[roomId] = Date.now() + 1000;
    setBadges((prev) => ({ ...prev, [roomId]: 0 }));
  }

  // Keep activeRoom data fresh when Firestore updates it
  function syncRoom(prev, updated) {
    if (!prev) return prev;
    return updated.find((r) => r.id === prev.id) ?? prev;
  }

  return { rooms, badges, markRead, syncRoom };
}

// ─── Custom hook: notification permission request on login ───
function useNotificationPermission(user, onGranted) {
  useEffect(() => {
    if (!user) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") onGranted();
      });
    }
  }, [user]);
}

// ─── Custom hook: ephemeral toast messages ───
function useToast() {
  const [message, setMessage] = useState(null);

  function push(text, ms = 3000) {
    setMessage(text);
    setTimeout(() => setMessage(null), ms);
  }

  return { message, push };
}

// ─────────────────────────────────────────────────────────────
function AppInner() {
  const { user } = useAuth();

  const [currentRoom, setCurrentRoom] = useState(null);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const toast = useToast();
  const { rooms, badges, markRead, syncRoom } = useRoomManager(user, currentRoomId);

  useNotificationPermission(user, () => toast.push("Notifications enabled!"));

  // Keep currentRoom in sync with live Firestore data
  useEffect(() => {
    setCurrentRoom((prev) => syncRoom(prev, rooms));
  }, [rooms]);

  function openRoom(room) {
    if (!room) {
      setCurrentRoom(null);
      setCurrentRoomId(null);
      return;
    }
    setCurrentRoom(room);
    setCurrentRoomId(room.id);
    setSearchOpen(false);
    markRead(room.id);
  }

  if (!user) return <AuthPage />;

  return (
    <div className="app-layout">
      {drawerOpen && (
        <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      <div className={`sidebar ${drawerOpen ? "open" : ""}`}>
        <Sidebar
          activeRoom={currentRoom}
          onSelectRoom={openRoom}
          onClose={() => setDrawerOpen(false)}
          rooms={rooms}
          unreadCounts={badges}
        />
      </div>

      <ChatArea
        room={currentRoom}
        onToggleSidebar={() => setDrawerOpen((v) => !v)}
        onSearchOpen={() => setSearchOpen((v) => !v)}
        searchOpen={searchOpen}
      />

      {toast.message && (
        <div className="toast animate-fadeIn">{toast.message}</div>
      )}
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