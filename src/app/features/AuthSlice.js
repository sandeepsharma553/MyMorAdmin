import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "react-toastify";

/* ---------------- helpers ---------------- */
const getLoginErrorMessage = (code) => {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Invalid e-mail or password";
    case "auth/user-disabled":
      return "Your account has been disabled. Please contact admin.";
    case "auth/too-many-requests":
      return "Too many attempts – please try again later.";
    case "auth/network-request-failed":
      return "Network error – check your connection and retry.";
    default:
      return "Something went wrong. Please try again.";
  }
};

// ✅ Convert Firestore Timestamp (and other non-plain objects) to serializable JSON
const toSerializable = (value) => {
  if (value == null) return value;

  // Firestore Timestamp has .toMillis()
  if (typeof value?.toMillis === "function") {
    return value.toMillis(); // store as number (ms)
  }

  if (Array.isArray(value)) return value.map(toSerializable);

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toSerializable(v);
    return out;
  }

  return value;
};

const pickDefaultActiveOrg = (employee) => {
  const hasHostel = !!employee?.hostelid;
  const hasUniclub = !!employee?.uniclubid;

  if (hasHostel && hasUniclub) return null; // show chooser
  if (hasUniclub) return "uniclub";
  if (hasHostel) return "hostel";
  return null;
};

/* ---------------- thunks ---------------- */
export const getEmployeeByUid = createAsyncThunk(
  "auth/getEmployeeByUid",
  async (uid, { rejectWithValue }) => {
    try {
      if (!uid) throw new Error("UID is missing");
      const docRef = doc(db, "employees", uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return rejectWithValue({ error: "Employee not found" });
      }

      const raw = { id: docSnap.id, ...(docSnap.data() || {}) };
      return toSerializable(raw); // ✅ Timestamp -> millis
    } catch (error) {
      toast.error(getLoginErrorMessage(error.code));
      return rejectWithValue({ error: error.code || error.message || "Failed to fetch employee" });
    }
  }
);

export const LoginAdmin = createAsyncThunk(
  "auth/loginadmin",
  async (userData, { dispatch, rejectWithValue }) => {
    try {
      const res = await signInWithEmailAndPassword(
        auth,
        userData.EmailID,
        userData.Password
      );

      const firebaseUser = res.user;
      if (!firebaseUser?.uid) {
        return rejectWithValue({ error: "Login failed" });
      }

      // ✅ ONLY store plain JSON user in redux
      const safeUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        emailVerified: firebaseUser.emailVerified,
        phoneNumber: firebaseUser.phoneNumber,
        providerId: firebaseUser.providerId,
      };

      const employee = await dispatch(getEmployeeByUid(firebaseUser.uid)).unwrap();

      return { isSuccess: true, user: safeUser, employee };
    } catch (error) {
      toast.error(getLoginErrorMessage(error.code));
      return rejectWithValue({ error: error.code || "Failed to login" });
    }
  }
);

export const logoutAdmin = createAsyncThunk(
  "auth/logout",
  async (_, { rejectWithValue }) => {
    try {
      await signOut(auth);
      localStorage.clear();
      return null;
    } catch (error) {
      return rejectWithValue({ error: error.message || "Failed to logout" });
    }
  }
);

/* ---------------- initial state ---------------- */
const initialState = {
  isLoggedIn: !!localStorage.getItem("userData"),
  isLoading: false,
  error: null,
  user: (() => {
    try {
      return JSON.parse(localStorage.getItem("userData")) || null;
    } catch {
      return null;
    }
  })(),
  employee: (() => {
    try {
      const v = localStorage.getItem("employee");
      if (!v || v === "undefined") return null;
      return JSON.parse(v);
    } catch {
      return null;
    }
  })(),
  type: localStorage.getItem("type") || null,
  activeOrg:
    localStorage.getItem("activeOrg") === "hostel" ||
    localStorage.getItem("activeOrg") === "uniclub"
      ? localStorage.getItem("activeOrg")
      : null,
};

/* ---------------- slice ---------------- */
const AuthSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setActiveOrg: (state, action) => {
      const v = action.payload;
      if (v !== "hostel" && v !== "uniclub" && v !== null) return;
      state.activeOrg = v;
      try {
        if (v) localStorage.setItem("activeOrg", v);
        else localStorage.removeItem("activeOrg");
      } catch {}
    },
    hydrateActiveOrg: (state) => {
      try {
        const v = localStorage.getItem("activeOrg");
        state.activeOrg = v === "hostel" || v === "uniclub" ? v : null;
      } catch {
        state.activeOrg = null;
      }
    },
    clearActiveOrg: (state) => {
      state.activeOrg = null;
      try {
        localStorage.removeItem("activeOrg");
      } catch {}
    },
    clearAuthError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(LoginAdmin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(LoginAdmin.fulfilled, (state, action) => {
        const { user, employee } = action.payload;

        state.isLoading = false;
        state.user = user; // ✅ safe JSON only
        state.employee = employee; // ✅ timestamp converted
        state.type = employee?.type || null;
        state.isLoggedIn = true;

        const computed = pickDefaultActiveOrg(employee);
        const stored = state.activeOrg;
        const hasHostel = !!employee?.hostelid;
        const hasUniclub = !!employee?.uniclubid;

        const storedValid =
          (stored === "hostel" && hasHostel) || (stored === "uniclub" && hasUniclub);

        state.activeOrg = storedValid ? stored : computed;

        localStorage.setItem("userData", JSON.stringify(user));
        localStorage.setItem("employee", JSON.stringify(employee));
        localStorage.setItem("type", state.type || "");
        localStorage.setItem("loginTime", Date.now().toString());

        if (state.activeOrg) localStorage.setItem("activeOrg", state.activeOrg);
        else localStorage.removeItem("activeOrg");
      })
      .addCase(LoginAdmin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.error || action.error?.message || "Login failed";
      })
      .addCase(getEmployeeByUid.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getEmployeeByUid.fulfilled, (state, action) => {
        state.isLoading = false;
        state.employee = action.payload; // ✅ serializable
      })
      .addCase(getEmployeeByUid.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.error || action.error?.message || "Failed to fetch employee";
      })
      .addCase(logoutAdmin.fulfilled, (state) => {
        state.isLoggedIn = false;
        state.isLoading = false;
        state.user = null;
        state.employee = null;
        state.error = null;
        state.type = null;
        state.activeOrg = null;
        localStorage.clear();
      });
  },
});

export const {
  setActiveOrg,
  hydrateActiveOrg,
  clearActiveOrg,
  clearAuthError,
} = AuthSlice.actions;

export default AuthSlice.reducer;
