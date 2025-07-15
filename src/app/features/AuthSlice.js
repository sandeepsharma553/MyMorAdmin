import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "../../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { toast } from "react-toastify";

const getLoginErrorMessage = (code) => {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid e-mail or password';
      case 'auth/user-disabled':
        return 'Your account has been disabled. Please contact admin.';
    case 'auth/too-many-requests':
      return 'Too many attempts – please try again later.';
    case 'auth/network-request-failed':
    return 'Network error – check your connection and retry.';
    default:
      return 'Something went wrong. Please try again.';
  }
};


export const LoginAdmin = createAsyncThunk(
  "auth/loginadmin",
  async (userData, { dispatch, rejectWithValue }) => {
    try {
      const res = await signInWithEmailAndPassword(auth, userData.EmailID, userData.Password);
      const firebaseUser = res.user;
      console.log(firebaseUser)
      if (!firebaseUser || !firebaseUser.uid) {
        return;
      }
      const employee = await dispatch(getEmployeeByUid(firebaseUser.uid)).unwrap();
      const response = {
        isSuccess: true,
        firebaseUser,
        employee,
      };
      return response;
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

      if (!uid) throw new Error('UID is missing');
      const docRef = doc(db, 'employees', uid);
      const docSnap = await getDoc(docRef);
      const response = { id: docSnap.id, ...docSnap.data() }
      return response;
    } catch (error) {
      toast.error(getLoginErrorMessage(error.code))
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
};

const AuthSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder


      .addCase(LoginAdmin.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(LoginAdmin.fulfilled, (state, action) => {
        const { firebaseUser, employee } = action.payload;
        const type = employee.type;
        state.isLoading = false;
        state.user = firebaseUser;
        state.employee = employee;
        state.type = type;
        state.isLoggedIn = true;
        const safeUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified,
          phoneNumber: firebaseUser.phoneNumber,
          providerId: firebaseUser.providerId
        };
        localStorage.setItem("userData", JSON.stringify(safeUser));
        localStorage.setItem("employee", JSON.stringify(employee));
        localStorage.setItem("type", type);
        localStorage.setItem("loginTime", Date.now().toString());
      })
      .addCase(LoginAdmin.rejected, (state, action) => {
        state.isLoading = false;
        // state.error = action.payload?.error || "Login failed";
      })
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
        // state.error = action.payload?.error || "Failed to fetch employee";
      })
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
