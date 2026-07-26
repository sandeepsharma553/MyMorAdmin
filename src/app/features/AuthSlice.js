import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase";
import { doc, onSnapshot } from "firebase/firestore";
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

const isValidId = (v) =>
  v !== undefined &&
  v !== null &&
  String(v).trim() !== "" &&
  String(v).trim().toLowerCase() !== "null" &&
  String(v).trim().toLowerCase() !== "undefined";

// ✅ Convert Firestore Timestamp (and other non-plain objects) to serializable JSON
const toSerializable = (value) => {
  if (value == null) return value;

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
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
  const hasHostel = isValidId(employee?.hostelid);
  const hasUniclub = isValidId(employee?.uniclubid);
  const hasUniversity = isValidId(employee?.universityid || employee?.universityId);
  const hasGroup = isValidId(employee?.groupId || employee?.groupid);

  if (hasGroup) return "restaurantGroup";
  if (hasUniclub) return "uniclub";
  if (hasHostel) return "hostel";
  if (hasUniversity) return "university";
  return "business";
};

const VALID_ORGS = ["hostel", "uniclub", "business", "university", "restaurantGroup"];

/* ── Live employee listener ── (mirrors MyMorOps authSlice, ff37816)
 * employees/{uid} used to be a one-shot getDoc whose result was mirrored to
 * localStorage and hydrated synchronously at startup — there was NO
 * onAuthStateChanged anywhere in this repo, so permissions were stale until an
 * explicit logout/login (even a reload only re-read the stale mirror). Now a
 * single module-level onSnapshot:
 *  - RESOLVE ONCE: LoginAdmin/bootstrapAuth await the FIRST snapshot (or error)
 *    only; later snapshots never re-settle the thunk.
 *  - DAMPENED: later snapshots dispatch employeeUpdated ONLY when the serialized
 *    doc actually changed (order-independent stringify — safe because
 *    toSerializable has already normalised Timestamps to millis).
 *  - FREEZE: employeeUpdated never touches state.type or state.activeOrg — see
 *    the reducer comment.
 *  - DEACTIVATION (owner ruling): a snapshot saying the doc is GONE, or carrying
 *    an EXPLICIT isActive === false (missing/undefined must never sign anyone
 *    out), signs the user out through the existing logoutAdmin path. Listener
 *    ERRORS never sign out an established session.
 */
let employeeUnsub = null; // module-level: exactly one live listener, ever
const stopEmployeeListener = () => {
  if (employeeUnsub) { try { employeeUnsub(); } catch {} employeeUnsub = null; }
};

// Order-independent stringify for the changed-payload check (snapshot key order is
// not guaranteed stable). Inputs are toSerializable outputs: plain JSON values only.
const stableStringify = (v) => {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
};

// Starts (replacing any predecessor) the live listener. Settles on the FIRST
// snapshot or error — the caller stores that first read via the fulfilled reducer;
// everything after flows through employeeUpdated. A failed FIRST read tears the
// listener down before rejecting.
const startEmployeeListener = (uid, { dispatch, getState }) =>
  new Promise((resolve, reject) => {
    stopEmployeeListener(); // a re-login replaces the previous listener, never stacks
    let settled = false;
    employeeUnsub = onSnapshot(
      doc(db, "employees", uid),
      (snap) => {
        if (!snap.exists()) {
          if (!settled) { settled = true; stopEmployeeListener(); reject(new Error("Employee not found")); }
          else dispatch(logoutAdmin()); // doc deleted mid-session → sign out
          return;
        }
        const employee = toSerializable({ id: snap.id, ...(snap.data() || {}) });
        if (employee.isActive === false) { // EXPLICIT false only — see header comment
          if (!settled) { settled = true; stopEmployeeListener(); reject(new Error("Account deactivated")); }
          else dispatch(logoutAdmin()); // deactivated mid-session → sign out
          return;
        }
        if (!settled) { settled = true; resolve(employee); return; } // first read → fulfilled reducer
        const prev = getState().auth.employee;
        if (prev && stableStringify(prev) === stableStringify(employee)) return; // unchanged — no dispatch
        dispatch(employeeUpdated(employee));
      },
      (err) => {
        if (!settled) { settled = true; stopEmployeeListener(); reject(err); }
        // established session: swallow — never sign out on a stream error
      }
    );
  });

/* ---------------- thunks ---------------- */

export const LoginAdmin = createAsyncThunk(
  "auth/loginadmin",
  async (userData, thunkAPI) => {
    const { rejectWithValue } = thunkAPI;
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

      const safeUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        emailVerified: firebaseUser.emailVerified,
        phoneNumber: firebaseUser.phoneNumber,
        providerId: firebaseUser.providerId,
      };

      // first snapshot (or error) settles here — the listener then stays live
      const employee = await startEmployeeListener(firebaseUser.uid, thunkAPI);

      return { isSuccess: true, user: safeUser, employee };
    } catch (error) {
      stopEmployeeListener(); // a failed login must not leave a live listener behind
      toast.error(getLoginErrorMessage(error.code));
      return rejectWithValue({ error: error.code || "Failed to login" });
    }
  }
);

// Runs once at startup: Firebase restores the persisted Auth session (IndexedDB),
// and if a user exists we attach the live employee listener; the FIRST snapshot
// resolves this thunk, clearing the `booting` gate. This REPLACES the retired
// localStorage hydration — a reload now re-reads the real session and the real doc,
// and an expired Firebase session lands on the login page instead of a zombie UI.
export const bootstrapAuth = createAsyncThunk(
  "auth/bootstrap",
  async (_, thunkAPI) =>
    new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, async (user) => {
        unsub();
        if (!user) return resolve(null);
        try {
          const safeUser = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            emailVerified: user.emailVerified,
            phoneNumber: user.phoneNumber,
            providerId: user.providerId,
          };
          const employee = await startEmployeeListener(user.uid, thunkAPI);
          resolve({ user: safeUser, employee });
        } catch {
          stopEmployeeListener();
          resolve(null);
        }
      });
    })
);

export const logoutAdmin = createAsyncThunk(
  "auth/logout",
  async (_, { rejectWithValue }) => {
    try {
      stopEmployeeListener(); // tear the live employee listener down BEFORE auth dies
      await signOut(auth);
      localStorage.clear(); // kept: clears remembered activeOrg + any legacy keys
      return null;
    } catch (error) {
      return rejectWithValue({ error: error.message || "Failed to logout" });
    }
  }
);

/* ---------------- initial state ---------------- */
// The localStorage mirror is RETIRED: state starts empty and bootstrapAuth (real
// Firebase session + live employee doc) populates it. `booting` gates first paint.
// (ChooseContextPage keeps its own "activeOrg" remember-key — that is a page-level
// preference it reads/writes itself, not this slice's auth mirror.)
const initialState = {
  isLoggedIn: false,
  isLoading: false,
  booting: true, // true until bootstrapAuth settles
  error: null,
  user: null,
  employee: null,
  type: null,
  activeOrg: null,
};

// Shared by LoginAdmin.fulfilled and bootstrapAuth.fulfilled — the ONLY two places
// allowed to set state.type and state.activeOrg (see employeeUpdated's freeze).
const applyAuth = (state, payload) => {
  const { user, employee } = payload;
  state.user = user;
  state.employee = employee;
  state.type = employee?.type || null;
  state.isLoggedIn = true;

  const computed = pickDefaultActiveOrg(employee);
  const stored = state.activeOrg;

  const hasHostel = isValidId(employee?.hostelid);
  const hasUniclub = isValidId(employee?.uniclubid);
  const hasUniversity = isValidId(employee?.universityid || employee?.universityId);
  const hasGroup = isValidId(employee?.groupId || employee?.groupid);
  const hasBusiness = !hasHostel && !hasUniclub && !hasUniversity && !hasGroup;

  const storedValid =
    (stored === "hostel" && hasHostel) ||
    (stored === "uniclub" && hasUniclub) ||
    (stored === "university" && hasUniversity) ||
    (stored === "restaurantGroup" && hasGroup) ||
    (stored === "business" && hasBusiness);

  state.activeOrg = storedValid ? stored : computed;
};

/* ---------------- slice ---------------- */
const AuthSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setActiveOrg: (state, action) => {
      const v = action.payload;
      if (v !== null && !VALID_ORGS.includes(v)) return;
      // mirror write retired — ChooseContextPage persists its own remember-key
      state.activeOrg = v;
    },
    hydrateActiveOrg: (state) => {
      try {
        const v = localStorage.getItem("activeOrg");
        state.activeOrg = VALID_ORGS.includes(v) ? v : null;
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
    // Live employee update (later snapshots only — the first read goes through
    // applyAuth). FREEZE (owner ruling): state.type and state.activeOrg are
    // deliberately NOT touched here — `type` drives the top-level product route
    // table and activeOrg drives which org a multi-org admin is working in;
    // re-routing someone between products mid-session is not intended behaviour.
    // Only LoginAdmin.fulfilled / bootstrapAuth.fulfilled may set those.
    employeeUpdated: (state, action) => {
      state.employee = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(LoginAdmin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(LoginAdmin.fulfilled, (state, action) => {
        state.isLoading = false;
        applyAuth(state, action.payload); // mirror writes retired — state only
      })
      .addCase(LoginAdmin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.error || action.error?.message || "Login failed";
      })
      .addCase(bootstrapAuth.fulfilled, (state, action) => {
        state.booting = false;
        if (action.payload) applyAuth(state, action.payload);
      })
      .addCase(bootstrapAuth.rejected, (state) => {
        state.booting = false;
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
  employeeUpdated,
} = AuthSlice.actions;

export default AuthSlice.reducer;