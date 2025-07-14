import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "../../firebase";
import { doc, getDoc,collection,query, where, getDocs  } from "firebase/firestore";
import { toast } from "react-toastify";

// 🔸 Map Firebase error codes to user-friendly messages
const getLoginErrorMessage = (code) => {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid e-mail or password';
    case 'auth/too-many-requests':
      return 'Too many attempts – please try again later.';
    case 'auth/network-request-failed':
      return 'Network error – check your connection and retry.';
    default:
      return 'Something went wrong. Please try again.';
  }
};

// 🔹 Login and fetch user + employee data
export const LoginAdmin = createAsyncThunk(
  "auth/loginadmin",
  async (userData, { dispatch, rejectWithValue }) => {
    try {
      const res = await signInWithEmailAndPassword(auth, userData.EmailID, userData.Password);
      const firebaseUser = res.user;
      // console.log(firebaseUser)
      const employee = await dispatch(getEmployeeByUid(firebaseUser.uid)).unwrap();
      // const user = await dispatch(getUserByUid(firebaseUser.uid)).unwrap();

      const response = {
        isSuccess: true,
        firebaseUser,
        user: employee, 
        employee,
      };

      return response;
    } catch (error) {
      toast.error(getLoginErrorMessage(error.code));
      return rejectWithValue({ error: error.code || "Failed to login" });
    }
  }
);

// 🔹 Fetch employee by UID (Firestore)
export const getEmployeeByUid = createAsyncThunk(
  "auth/getEemployeeByUid",
  async (uid, { rejectWithValue }) => {
    try {

      if (!uid) throw new Error('UID is missing');

      const docRef = doc(db, 'employee', uid);
      const docSnap = await getDoc(docRef);
      console.log(docSnap.data(),'employee')
      const response = { id: docSnap.id, ...docSnap.data() }
      return response;
    } catch (error) {

      toast.error(getLoginErrorMessage(error.code))

      return rejectWithValue(error.code || "Failed to login");
    }
  }
);
export const getUserByUid = createAsyncThunk(
  "auth/getUserByUid",
  async (uid, { rejectWithValue }) => {
    try {

      if (!uid) throw new Error('UID is missing');
      const q = query(collection(db, "User"), where("uid", "==", uid));
      const snapshot = await getDocs(q);
    
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    } catch (error) {

      // toast.error(getLoginErrorMessage(error.code))

      return rejectWithValue(error.code || "Failed to login");
    }
  }
);


// 🔹 Logout
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

// ✅ Initial State
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
  role: localStorage.getItem("role") || null,
};

// ✅ Auth Slice
const AuthSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder

      // 🔸 Login flow
      .addCase(LoginAdmin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(LoginAdmin.fulfilled, (state, action) => {
        const {firebaseUser ,user, employee } = action.payload;
        const role = user.role || employee.role;

        state.isLoading = false;
        state.user = user;
        state.employee = employee;
        state.role = role;
        state.isLoggedIn = true;
        localStorage.setItem("userData", JSON.stringify(firebaseUser));
        localStorage.setItem("employee", JSON.stringify(employee));
        localStorage.setItem("role", role);
        localStorage.setItem("loginTime", Date.now().toString());
      })
      .addCase(LoginAdmin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.error || "Login failed";
      })

      // 🔸 Get employee
      .addCase(getEmployeeByUid.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getEmployeeByUid.fulfilled, (state, action) => {
        state.isLoading = false;
        state.employee = action.payload;
      })
      .addCase(getEmployeeByUid.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.error || "Failed to fetch employee";
      })
      .addCase(getUserByUid.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getUserByUid.fulfilled, (state, action) => {
        state.isLoading = false;
      })
      .addCase(getUserByUid.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.error || "Failed to fetch employee";
      })

      // 🔸 Logout
      .addCase(logoutAdmin.fulfilled, (state) => {
        state.isLoggedIn = false;
        state.user = null;
        state.employee = null;
        state.role = null;
        state.error = null;
        localStorage.clear();
      });
  },
});

export default AuthSlice.reducer;
