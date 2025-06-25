import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";
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
  async (userData, { rejectWithValue }) => {
    try {
      const res = await signInWithEmailAndPassword(auth, userData.EmailID, userData.Password);
      const response = { 'isSuccess': true, 'message': 'ok', 'data': res.user.uid }
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
          state.user = action.payload;
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
      });
    builder.addCase(logoutAdmin.fulfilled, (state) => {
      state.isLoading = false;
      state.isLoggedIn = false;
      state.user = null;
      state.error = null;
      localStorage.removeItem("userData");
    });
  },
});

export default AuthSlice.reducer;
