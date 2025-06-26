import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../firebase";
import { doc, getDoc } from 'firebase/firestore';
import { ToastContainer, toast } from "react-toastify";

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
}
export const LoginAdmin = createAsyncThunk(

  "auth/loginadmin",
  async (userData, { dispatch, rejectWithValue }) => {
    try {
      const res = await signInWithEmailAndPassword(auth, userData.EmailID, userData.Password);
      const response = { 'isSuccess': true, 'message': 'ok', 'data': res.user }
      const employee = await dispatch(getEmployeeByUid(res.user.uid)).unwrap();
      // return { response, employee };
      return response;
    } catch (error) {

      toast.error(getLoginErrorMessage(error.code))

      return rejectWithValue(error.code || "Failed to login");
    }
  }
);
export const getEmployeeByUid = createAsyncThunk(
  "auth/getEemployeeByUid",
  async (uid, { rejectWithValue }) => {
    try {

      if (!uid) throw new Error('UID is missing');

      const docRef = doc(db, 'employee', uid);
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
      localStorage.removeItem("userData");
      localStorage.removeItem("employee");
      return null;
    } catch (error) {
      return rejectWithValue(error.message || "Failed to logout"); // Provide a custom error message
    }
  }
);

const AuthSlice = createSlice({
  name: "auth",
  initialState: {
    isLoggedIn: !!localStorage.getItem("userData"), // Change initial state to false as the user is not logged in initially
    isLoading: false,
    error: null,
    user: JSON.parse(localStorage.getItem("userData")) || null,
    employee:
      localStorage.getItem('employee') !== null && localStorage.getItem('employee') !== 'undefined'
        ? JSON.parse(localStorage.getItem('employee'))
        : null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(LoginAdmin.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(LoginAdmin.fulfilled, (state, action) => {
        if (
          action.payload.isSuccess
        ) {
          state.isLoading = false;
          state.user = action.payload.data;
          state.isLoggedIn = true;
          localStorage.setItem("userData", JSON.stringify(action.payload.data));
        } else {
          state.isLoading = false;
          state.error = "Invalid user or login failed.";
        }
      })
      .addCase(LoginAdmin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload.error;
      })
      .addCase(getEmployeeByUid.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(getEmployeeByUid.fulfilled, (state, action) => {
        console.log(action.payload)
        if (
          action.payload
        ) {
          state.isLoading = false;
          state.employee = action.payload;
          localStorage.setItem("employee", JSON.stringify(action.payload));
        } else {
          state.isLoading = false;
          state.error = "user not found.";
        }
      })
      .addCase(getEmployeeByUid.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload.error;
      })

    builder.addCase(logoutAdmin.fulfilled, (state) => {
      state.isLoading = false;
      state.isLoggedIn = false;
      state.user = null;
      state.error = null;
      state.employee = null;
      localStorage.removeItem("userData");
      localStorage.removeItem("employee");
    });
  },
});

export default AuthSlice.reducer;
