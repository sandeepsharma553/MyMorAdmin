import React, { useState, useEffect } from "react";
import NavBar from "../components/NavBar";
import { Route, Routes, Navigate } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import Userslist from "./Userslist";
function HomePage() {
  const navigate = useNavigate();
  const [navbarHeight, setNavbarHeight] = useState(0);
  const [userRole, setUserRole] = useState();
  console.log(userRole);
  const handleNavbarHeightChange = (height) => {
    setNavbarHeight(height);
  };
  // const userRole = 2;
  useEffect(() => {
    const storedUserData = localStorage.getItem("userData");
    if (storedUserData) {
      const userData = JSON.parse(storedUserData);
      setUserRole(userData.userRole);
    }
    console.log(userRole);
    if (userRole === 4) {
      navigate("allVisits");
    }
  }, [navigate, userRole]);
  // Redirect to "All Visits" if userRole is 4

  return (
    <div>
      {/* <NavBar onNavbarHeightChange={handleNavbarHeightChange} /> */}

      <div style={{ marginTop: "64px" }}>
        {/* Your router content */}
        <Routes>
          <Route
            path="/user"
            element={<Userslist navbarHeight={navbarHeight} />}
          />
          {/* <Route path="/addproduct" element={<AddProduct />} />
          <Route path="/masterpage" element={<MasterPage />} />
          <Route path="/productlist" element={<ProductList />} /> */}
          {/* <Route path="/user/:id" element={<UserDetails />} /> */}
          {/* <Route path="/redeemrequests" element={<GiftRequestsPage />} />

          <Route path="/allVisits" element={<AllExpenses />} />
          <Route path="/addVisit" element={<AddVisitPage />} /> */}

          {/* Add more routes here */}

          {/* Add more routes here */}
        </Routes>
      </div>
    </div>
  );
}

export default HomePage;
