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
import AccountDeletionPage from "./AccountDeletionPage";
import UniversityPage from "./UniversityPage";
import HostelPage from "./HostelPage";
import AnnouncementPage from "./AnnouncementPage";
import EmployeePage from "./EmployeePage";
import ChangePasswordPage from "./ChangePasswordPage";
import ResourcesPage from "./ResourcesPage";
function HomePage() {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState();

  useEffect(() => {
    const storedUserData = localStorage.getItem("userData");
    if (storedUserData) {
      const userData = JSON.parse(storedUserData);
      setUserRole(userData.userRole);
    }
    if (userRole === 4) {
      navigate("allVisits");
    }
  }, [navigate, userRole]);

  return (
    <div>
      <div>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/diningmenupage" element={<DiningMenuPage />} />
          <Route path="/cleaningpage" element={<CleaningSchedulePage />} />
          <Route path="/maintenancepage" element={<MaintenancePage />} />
          <Route path="/bookingpage" element={<BookingPage />} />
          <Route path="/academicpage" element={<AcademicGroupPage />} />
          <Route path="/announcement" element={<AnnouncementPage />} />
          <Route path="/reportpage" element={<ReportIncidentPage />} />
          <Route path="/eventpage" element={<EventPage />} />
          <Route path="/dealpage" element={<DealPage />} />
          <Route path="/requestdelete" element={<AccountDeletionPage />} />
          <Route path="/university" element={<UniversityPage />} />
          <Route path="/hostel" element={<HostelPage />} />
          <Route path="/employee" element={<EmployeePage />} />
          <Route path="/changepassword" element={<ChangePasswordPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default HomePage;
