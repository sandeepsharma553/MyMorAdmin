import React, { useRef, useEffect, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Menu from "@mui/material/Menu";
import logoImage from "../assets/logo1.png";
import MenuIcon from "@mui/icons-material/Menu";
import Container from "@mui/material/Container";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import MenuItem from "@mui/material/MenuItem";
// import AdbIcon from "@mui/icons-material/Adb";
import { useDispatch, useSelector } from "react-redux";
import Badge from "@mui/material/Badge";
import { useNavigate } from "react-router-dom";

import { logoutAdmin } from "../app/features/AuthSlice";
const userRequestCount = 5;
const pages = [
  "Users",
  "Add Products",
  "Master Page",
  "Product List",
  "Redeem Requests",
  "All Visits",
  "Add Visit"
];
const settings = ["Logout"];

function NavBar({ onLogout, onNavbarHeightChange }) {
  // const userRole = useSelector((state) => state.auth.user?.data?.userRole);
  const [anchorElNav, setAnchorElNav] = useState(null);
  const [anchorElUser, setAnchorElUser] = useState(null);
  const navigate = useNavigate();
  const navbarRef = useRef(null);
  const [userRole, setUserRole] = useState();

  useEffect(() => {
    const storedUserData = localStorage.getItem("userData");
    if (storedUserData) {
      const userData = JSON.parse(storedUserData);
      setUserRole(userData.userRole);
    }
    console.log(userRole);
    if (navbarRef.current) {
      const navbarHeight = navbarRef.current.offsetHeight;
      onNavbarHeightChange(navbarHeight);
    }
  }, [navbarRef, onNavbarHeightChange]);

  const handleOpenNavMenu = (event) => {
    setAnchorElNav(event.currentTarget);
  };

  const handleOpenUserMenu = (event) => {
    setAnchorElUser(event.currentTarget);
  };

  const handleCloseNavMenu = () => {
    setAnchorElNav(null);
  };

  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };
  const dispatch = useDispatch();
  const handleLogout = () => {
    // Clear user session data from localStorage
    dispatch(logoutAdmin()); // Assuming your token is stored as "userToken"

    // Perform any additional logout actions here (e.g., redirect to login page)
    // navigate("/");

    // Close the user menu after logout
    handleCloseUserMenu();
  };

  const handleNavigationClick = (page) => {
    if (userRole === 4 && page !== "All Visits") {
      alert("You have access only to 'All Visits'.");
      // If userRole is 4, prevent navigation to pages other than "All Visits"
      return;
    }
    // Handle navigation based on the selected page
    if (page === "Users") {
      navigate("/home/user");
    } else if (page === "Add Products") {
      navigate("/home/addproduct");
    } else if (page === "Master Page") {
      navigate("/home/masterpage");
    } else if (page === "Product List") {
      navigate("/home/productlist");
    } else if (page === "Redeem Requests") {
      navigate("/home/redeemrequests");
    } else if (page === "All Visits") {
      navigate("/home/allVisits");
    }else if (page === "Add Visit") {
      navigate("/home/addVisit");
    }

    handleCloseNavMenu();
  };

  return (
    <div ref={navbarRef} className="fixed top-0 left-0 right-0 z-10">
      <AppBar position="static">
        <Container maxWidth="xl">
          <Toolbar disableGutters>
            <Typography
              variant="h6"
              noWrap
              component="a"
              // href=""
              sx={{
                mr: 2,
                display: { xs: "none", md: "flex" },
                fontFamily: "monospace",
                fontWeight: 900,
                letterSpacing: ".3rem",
                color: "inherit",
                textDecoration: "none",
              }}
            >
              HGHAAT
            </Typography>

            <Box sx={{ flexGrow: 1, display: { xs: "flex", md: "none" } }}>
              <IconButton
                size="large"
                aria-label="account of current user"
                aria-controls="menu-appbar"
                aria-haspopup="true"
                onClick={handleOpenNavMenu}
                color="inherit"
              >
                {" "}
                <MenuIcon />
              </IconButton>
              <Menu
                id="menu-appbar"
                anchorEl={anchorElNav}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "left",
                }}
                keepMounted
                transformOrigin={{
                  vertical: "top",
                  horizontal: "left",
                }}
                open={Boolean(anchorElNav)}
                onClose={handleCloseNavMenu}
                sx={{
                  display: { xs: "block", md: "none" },
                }}
              >
                {pages.map((page) => (
                  <MenuItem
                    key={page}
                    onClick={() => handleNavigationClick(page)}
                  >
                    <Typography textAlign="center">
                      {page === "Redeem Requests" ? ( // Check if the page is "Redeem Requests"
                        <Badge badgeContent={userRequestCount} color="error">
                          {page}
                        </Badge>
                      ) : (
                        page
                      )}
                    </Typography>
                  </MenuItem>
                ))}
              </Menu>
            </Box>

            <Typography
              variant="h5"
              noWrap
              component="a"
              href=""
              sx={{
                mr: 2,
                display: { xs: "flex", md: "none" },
                flexGrow: 1,
                fontFamily: "monospace",
                fontWeight: 700,
                letterSpacing: ".3rem",
                color: "inherit",
                textDecoration: "none",
              }}
            >
              HGHAAT
            </Typography>

            <Box sx={{ flexGrow: 1, display: { xs: "none", md: "flex" } }}>
              {pages.map((page) => (
                <Button
                  key={page}
                  onClick={() => handleNavigationClick(page)}
                  sx={{
                    my: 2,
                    color: "white",
                    display:
                      userRole === 4 && page !== "All Visits"
                        ? "none"
                        : "block",
                  }}
                >
                  {page === "Redeem Requests" ? page : page}
                </Button>
              ))}
            </Box>

            <Box sx={{ flexGrow: 0 }}>
              <Tooltip title="Open settings">
                <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                  <Avatar alt="" src={logoImage} />
                </IconButton>
              </Tooltip>
              <Menu
                sx={{ mt: "45px" }}
                id="menu-appbar"
                anchorEl={anchorElUser}
                anchorOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
                keepMounted
                transformOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
                open={Boolean(anchorElUser)}
                onClose={handleCloseUserMenu}
              >
                {settings.map((setting) => (
                  <MenuItem
                    key={setting}
                    onClick={
                      setting === "Logout" ? handleLogout : handleCloseUserMenu
                    }
                  >
                    <Typography textAlign="center">{setting}</Typography>
                  </MenuItem>
                ))}
              </Menu>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>
    </div>
  );
}

export default NavBar;
