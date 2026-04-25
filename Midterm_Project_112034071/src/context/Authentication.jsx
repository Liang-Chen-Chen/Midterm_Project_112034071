import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch or create user profile in Firestore
        const profileRef = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(profileRef);
        if (!snap.exists()) {
          const newProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            username: firebaseUser.displayName || firebaseUser.email.split("@")[0],
            photoURL: firebaseUser.photoURL || "",
            phone: "",
            address: "",
            createdAt: new Date(),
            blockedUsers: [],
          };
          await setDoc(profileRef, newProfile);
          setUserProfile(newProfile);
        } else {
          setUserProfile(snap.data());
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, userProfile, setUserProfile, loading }}>
      {/* {!loading && children} */}
      {loading ? <div>Loading...</div> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
