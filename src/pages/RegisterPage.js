import React, { useState, useEffect } from "react";

import { useDispatch, useSelector } from "react-redux";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import {
  createAdmin,
  LoginAdmin,
  login,
  logout,
} from "../app/features/AuthSlice";
import { BeatLoader } from "react-spinners";

const registrationSchema = Yup.object().shape({
  name: Yup.string().min(3, "Too Short!").required("Name is required"),
  email: Yup.string().email("Invalid email"),
  password: Yup.string()
    .min(8, "Password must be at least 8 characters")
    .required("Password is required"),
  mobileNo: Yup.string()
    .matches(/^(\+\d{1,3}[- ]?)?\d{10}$/, "Invalid phone number")
    .required("Mobile number is required"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password"), null], "Passwords must match") // Ensure it matches the 'password' field
    .required("Confirm Password is required"),
});

const RegisterPage = () => {
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);

  const initialValues = {
    name: "",
    email: "",
    mobileNo: "",
    password: "",
    confirmPassword: "",
  };
 
  const handleSubmit = (values) => {
    const signupData = {
      name: values.name,
      email: values.email,
      MobileNo: values.mobileNo, // Assuming mobileNo is the form field for phone number
      Password: values.password,
      UserRole: 1,
    };
    console.log(signupData);
    setIsLoading(true);
    dispatch(createAdmin(signupData));
  };

  return (
    <div
      className="pt-5  h-screen    bg-cover bg-center"
      style={{
        backgroundImage:
          "url('https://www.italjmed.org/public/journals/1/homepageImage_en_US.jpg')",
      }}
    >
      {isLoading ? (
        <BeatLoader color="black" loading={true} />
      ) : (
        <Formik
          initialValues={initialValues}
          validationSchema={registrationSchema}
          onSubmit={handleSubmit}
        >
          <Form className="max-w-md mx-auto p-4 bg-gray-100 rounded-md">
            <div className="mb-3">
              <div>
                <ToastContainer autoClose={3000} />
              </div>
              <div className="mb-3 text-center">
                <h1 className="text-2xl font-bold mt-1 mb-4">
                  Admin Registration
                </h1>
              </div>
              <label className="font-semibold" htmlFor="name">
                Name:
              </label>
              <Field
                type="text"
                id="name"
                name="name"
                className="block w-full border-gray-300 rounded-md p-2"
              />
              <ErrorMessage
                name="name"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>

            <div className="mb-3">
              <label className="font-semibold" htmlFor="email">
                Email:
              </label>
              <Field
                type="email"
                id="email"
                name="email"
                className="block w-full border-gray-300 rounded-md p-2"
              />
              <ErrorMessage
                name="email"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>

            <div className="mb-3">
              <label className="font-semibold" htmlFor="mobileNo">
                Mobile:
              </label>
              <Field
                type="text"
                id="mobileNo"
                name="mobileNo"
                className="block w-full border-gray-300 rounded-md p-2"
              />
              <ErrorMessage
                name="mobileNo"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>

            <div className="mb-3">
              <label className="font-semibold" htmlFor="password">
                Password:
              </label>
              <Field
                type="password"
                id="password"
                name="password"
                className="block w-full border-gray-300 rounded-md p-2"
              />
              <ErrorMessage
                name="password"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <div className="mb-3">
              <label className="font-semibold" htmlFor="confirmPassword">
                Confirm Password:
              </label>
              <Field
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                className="block w-full border-gray-300 rounded-md p-2"
              />
              <ErrorMessage
                name="confirmPassword"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>

            <button
              type="submit"
              className="bg-blue-500 text-white px-4 py-2 rounded-md"
            >
              Register
            </button>
          </Form>
        </Formik>
      )}
    </div>
  );
};

export default RegisterPage;
