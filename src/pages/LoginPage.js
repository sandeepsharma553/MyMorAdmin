import React, { useState } from "react";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { useNavigate } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";
import { adminLogin } from "../app/Api"; // Import your login API function here
import { useDispatch, useSelector } from "react-redux";
import { BeatLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { LoginAdmin } from "../app/features/AuthSlice";
const LoginPage = ({ onLogin }) => {
  const isLoading = useSelector((state) => state.auth.isLoading);
  const error = useSelector((state) => state.auth.error);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const initialValues = {
    Mobile: "",
    Password: "",
  };

  const showToastMessage = (message) => {
    toast.error(message, {
     //position: toast.POSITION.TOP_RIGHT,
    });
  };

  const validationSchema = Yup.object().shape({
    // UserName: Yup.string()
    //   //.matches(/^(\+\d{1,3}[- ]?)?\d{10}$/, "Invalid phone number")
    //   .required("User Name is required"),
    UserName: Yup.string()
      
      .required("User Name is required"),
    Password: Yup.string().required("Password is required"),
  });
  const handleSubmit = async (values) => {
    try {
      await dispatch(LoginAdmin(values));
      // Redirect or perform any action upon successful login
    } catch (error) {
      showToastMessage(error.message || "Failed to login");
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-cover bg-center">
      <div className="w-full max-w-xs">
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          <Form className="bg-gray-100 shadow-md rounded px-8 pt-6 pb-8 mb-4">
            <h2 className="text-center text-xl font-bold mb-4"> Login</h2>
            <div className="mb-4">
              <label
                htmlFor="id"
                className="block text-gray-700 text-sm font-bold mb-2"
              >
                User Name
              </label>
              <Field
                type="tel"
                id="UserName"
                name="UserName"
                className="appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
              <ErrorMessage
                name="UserName"
                component="p"
                className="text-red-500 text-xs italic"
              />
            </div>
            <div className="mb-4">
              <label
                htmlFor="Password"
                className="block text-gray-700 text-sm font-bold mb-2"
              >
                Password
              </label>
              <Field
                type="password"
                id="Password"
                name="Password"
                className="appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
              <ErrorMessage
                name="Password"
                component="p"
                className="text-red-500 text-xs italic"
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                // disabled={isSubmitting}
              >
                {isLoading ? (
                  <BeatLoader size={8} color={"#ffffff"} loading={true} />
                ) : (
                  "Sign In"
                )}
              </button>
            </div>
          </Form>
        </Formik>
        {error && showToastMessage(error)}{" "}
        {/* Show error toast when there is an error */}
        <ToastContainer />
      </div>
    </div>
  );
};

export default LoginPage;
