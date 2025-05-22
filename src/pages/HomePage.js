import React, { useState, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import DiningMenuPage from "./DiningMenuPage";
import CleaningSchedulePage from "./CleaningSchedulePage";
import MaintenancePage from "./MaintenancePage";
import AcademicGroupPage from "./AcademicGroupPage";
import ReportIncidentPage from "./ReportIncidentPage";
import EventPage from "./EventPage";
import DealPage from "./DealPage";
import BookingPage from "./BookingPage";
import AccountDeletionRequest from "./AccountDeletionRequest";
function HomePage() {
  const navigate = useNavigate();
 // const [navbarHeight, setNavbarHeight] = useState(0);
  const [userRole, setUserRole] = useState();
  console.log(userRole);
  // const handleNavbarHeightChange = (height) => {
  //   setNavbarHeight(height);
  // };
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

      <div>
        {/* Your router content */}
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />}/>
          <Route path="/diningmenupage" element={<DiningMenuPage />} />
          <Route path="/cleaningpage" element={<CleaningSchedulePage />} />
          <Route path="/maintenancepage" element={<MaintenancePage />} />
          <Route path="/bookingpage" element={<BookingPage />} />
          <Route path="/academicpage" element={<AcademicGroupPage />} />
          <Route path="/reportpage" element={<ReportIncidentPage />} />
          <Route path="/eventpage" element={<EventPage />} />
          <Route path="/dealpage" element={<DealPage />} />
          <Route path="/requestdelete" element={<AccountDeletionRequest />} />
         
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
