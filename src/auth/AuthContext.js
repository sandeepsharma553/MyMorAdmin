import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [collegeId, setCollegeId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        const data = userDoc.exists() ? userDoc.data() : null;
  
        setUser(firebaseUser);
        setRole(data?.role || null);
        setCollegeId(data?.collegeId || null);
      } else {
        setUser(null);
        setRole(null);
        setCollegeId(null);
      }
      setLoading(false);
    });
  
    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, collegeId, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
