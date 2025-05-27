import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";
export const createAdmin = createAsyncThunk(
  "auth/createadmin",
  async (userData, { rejectWithValue }) => {
    try {
      const response = ""//await adminRegister("registration", userData);
      console.log(response);
      window.location.href = "/";
      return response;
    } catch (error) {
      // Handle the error properly, you can provide a custom error message or the entire error object
      return rejectWithValue(error.message || "Failed to create admin"); // Provide a custom error message
    }
  }
);

export const LoginAdmin = createAsyncThunk(
  "auth/loginadmin",
  async (userData, { rejectWithValue }) => {
    try {

      const res = await signInWithEmailAndPassword(auth, userData.EmailID, userData.Password);
      console.log("User logged in:", res.user);
     const response =  { 'isSuccess': true,'message':'ok','data':res.user.uid} //await adminLogin("login", userData);
      console.log(response);
      return response;
    } catch (error) {
      // Handle the error properly, you can provide a custom error message or the entire error object
      return rejectWithValue(error.message || "Failed to login"); // Provide a custom error message
    }
  }
);

export const logoutAdmin = createAsyncThunk(
  "auth/logout",
  async (_, { rejectWithValue }) => {
    try {
      // Clear user session data from localStorage or perform any other logout actions

      // Optionally, you can make an API call to logout on the server-side if necessary

      localStorage.removeItem("userData"); // Remove user data from localStorage
      return null; // Return null or any appropriate payload indicating successful logout
    } catch (error) {
      // Handle the error properly, you can provide a custom error message or the entire error object
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
      .addCase(createAdmin.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(createAdmin.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = action.payload.message;
        // state.user = action.payload;
        // state.isLoggedIn = true;
      })
      .addCase(createAdmin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload.error;
      })
      .addCase(LoginAdmin.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(LoginAdmin.fulfilled, (state, action) => {
        //const userData = action.payload.data;
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
      state.isLoggedIn = false; // Set isLoggedIn to false after successful logout
      state.user = null; // Clear user data
      state.error = null;
      localStorage.removeItem("userData"); // Clear user data from localStorage
    });
  },
});

export default AuthSlice.reducer;
