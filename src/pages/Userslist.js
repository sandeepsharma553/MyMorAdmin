import React, { useState, useEffect, useRef } from "react";
import { BeatLoader } from "react-spinners";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
export default function Userslist(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: "#e0e0e0",
        }}
      >
        <div>
      <h2 className="text-2xl font-bold mb-4">Welcome to the Home Page</h2>
      <p>This is your main content area.</p>
    </div>
       </div>
    </div>
  );
}
