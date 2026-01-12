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

// Decide org default based on employee access
const pickDefaultActiveOrg = (employee) => {
  const hasHostel = !!employee?.hostelid;
  const hasUniclub = !!employee?.uniclubid;

  if (hasHostel && hasUniclub) return null; // show chooser
  if (hasUniclub) return "uniclub";
  if (hasHostel) return "hostel";
  return null;
};

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
      if (!firebaseUser?.uid) return;

      const employee = await dispatch(getEmployeeByUid(firebaseUser.uid)).unwrap();

      return { isSuccess: true, firebaseUser, employee };
    } catch (error) {
      toast.error(getLoginErrorMessage(error.code));
      return rejectWithValue({ error: error.code || "Failed to login" });
    }
  }
);

export const getEmployeeByUid = createAsyncThunk(
  "auth/getEemployeeByUid",
  async (uid, { rejectWithValue }) => {
    try {
      if (!uid) throw new Error("UID is missing");
      const docRef = doc(db, "employees", uid);
      const docSnap = await getDoc(docRef);
      return { id: docSnap.id, ...docSnap.data() };
    } catch (error) {
      toast.error(getLoginErrorMessage(error.code));
      return rejectWithValue(error.code || "Failed to login");
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
      return rejectWithValue(error.message || "Failed to logout");
    }
  }
);

/* ---------------- initial state ---------------- */
const initialState = {
  isLoggedIn: !!localStorage.getItem("userData"),
  isLoading: false,
  error: null,
  user: JSON.parse(localStorage.getItem("userData")) || null,
  employee:
    localStorage.getItem("employee") !== null &&
    localStorage.getItem("employee") !== "undefined"
      ? JSON.parse(localStorage.getItem("employee"))
      : null,
  type: localStorage.getItem("type") || null,

  // ✅ NEW: activeOrg ("hostel" | "uniclub" | null)
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
    // ✅ user switches context manually
    setActiveOrg: (state, action) => {
      const v = action.payload;
      if (v !== "hostel" && v !== "uniclub" && v !== null) return;
      state.activeOrg = v;
      try {
        if (v) localStorage.setItem("activeOrg", v);
        else localStorage.removeItem("activeOrg");
      } catch {}
    },

    // ✅ load from localStorage on app mount if you want
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
  },
  extraReducers: (builder) => {
    builder
      .addCase(LoginAdmin.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(LoginAdmin.fulfilled, (state, action) => {
        const { firebaseUser, employee } = action.payload;

        const type = employee?.type;
        state.isLoading = false;
        state.user = firebaseUser;
        state.employee = employee;
        state.type = type;
        state.isLoggedIn = true;

        // ✅ NEW: decide activeOrg
        const computed = pickDefaultActiveOrg(employee);

        // If already stored and still valid, keep it.
        const stored = state.activeOrg; // from initial state
        const hasHostel = !!employee?.hostelid;
        const hasUniclub = !!employee?.uniclubid;

        const storedValid =
          (stored === "hostel" && hasHostel) || (stored === "uniclub" && hasUniclub);

        state.activeOrg = storedValid ? stored : computed;

        const safeUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified,
          phoneNumber: firebaseUser.phoneNumber,
          providerId: firebaseUser.providerId,
        };

        localStorage.setItem("userData", JSON.stringify(safeUser));
        localStorage.setItem("employee", JSON.stringify(employee));
        localStorage.setItem("type", type);
        localStorage.setItem("loginTime", Date.now().toString());

        // ✅ persist activeOrg if selected
        if (state.activeOrg) localStorage.setItem("activeOrg", state.activeOrg);
        else localStorage.removeItem("activeOrg");
      })
      .addCase(LoginAdmin.rejected, (state) => {
        state.isLoading = false;
      })
      .addCase(getEmployeeByUid.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getEmployeeByUid.fulfilled, (state, action) => {
        state.isLoading = false;
        state.employee = action.payload;
      })
      .addCase(getEmployeeByUid.rejected, (state) => {
        state.isLoading = false;
      })
      .addCase(logoutAdmin.fulfilled, (state) => {
        state.isLoggedIn = false;
        state.isLoading = false;
        state.user = null;
        state.employee = null;
        state.role = null;
        state.error = null;
        state.type = null;

        // ✅ clear activeOrg
        state.activeOrg = null;

        localStorage.clear();
      });
  },
});

export const { setActiveOrg, hydrateActiveOrg, clearActiveOrg } = AuthSlice.actions;
export default AuthSlice.reducer;
