import React from "react";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
// import { useNavigate } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";
import { useDispatch, useSelector } from "react-redux";
import { BeatLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { LoginAdmin } from "../app/features/AuthSlice";
import logoImage from "../assets/loginimage.jpg";
import rightimage from "../assets/rightimage.jpg";
const LoginPage = ({ onLogin }) => {
  const isLoading = useSelector((state) => state.auth.isLoading);
  const error = useSelector((state) => state.auth.error);
  const dispatch = useDispatch();
  // const navigate = useNavigate();
  const initialValues = {
    EmailID: "",
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
    EmailID: Yup.string()

      .required("User Name is required"),
    Password: Yup.string().required("Password is required"),
  });
  const handleSubmit = async (values) => {
    try {
      await dispatch(LoginAdmin(values));
    } catch (error) {
      showToastMessage(error.message || "Failed to login");
    }
  };

  return (
    <div className="flex h-screen">
      {/* Left Panel */}
      <div className="w-1/2 bg-black flex flex-col items-center justify-center relative">
        <h1 className="text-white text-4xl font-bold mb-6 z-10">MyMor</h1>
        <img
          src={rightimage} 
          alt="Login Visual"
          className="max-w-full h-auto object-contain"
        />
      </div>

      {/* Right Panel */}
      <div className="w-1/2 bg-white flex flex-col items-center justify-center px-8">
        <img
          src={logoImage}
          alt="Logo"
          className="w-16 h-16 mb-4"
        />
        <h2 className="text-2xl font-bold text-blue-600 mb-6">Welcome</h2>
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >

          <Form className="w-full max-w-sm space-y-4">
            <div>
              <label
                htmlFor="id"
                className="block text-gray-700 text-sm font-bold mb-2"
              >
                Email/Username
              </label>
              <Field
                type="tel"
                id="EmailID"
                name="EmailID"
                className="appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
              <ErrorMessage
                name="EmailID"
                component="p"
                className="text-red-500 text-xs italic"
              />
            </div>
            <div>
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
            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 transition"
            // disabled={isSubmitting}
            >
              {isLoading ? (
                <BeatLoader size={8} color={"#ffffff"} loading={true} />
              ) : (
                "Login"
              )}
            </button>
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
