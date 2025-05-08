import React, { useState } from 'react';
import { X, MenuIcon } from 'lucide-react';
import '../index.css';
import Menu from "@mui/material/Menu";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import logoImage from "../assets/logo1.png";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";
import MenuItem from "@mui/material/MenuItem";
import { useDispatch, useSelector } from "react-redux";
import { logoutAdmin } from "../app/features/AuthSlice";
export default function Header({ onClick }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [anchorElUser, setAnchorElUser] = useState(null);
  const settings = ["Logout"];
  const handleOpenUserMenu = (event) => {
    setAnchorElUser(event.currentTarget);
  };
  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };
  const dispatch = useDispatch();
  const handleLogout = () => {
    dispatch(logoutAdmin()); // Assuming your token is stored as "userToken"
    // Close the user menu after logout
    handleCloseUserMenu();
  };
  return (
    <header className="bg-blue-600 text-white p-2 header">
       <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <button
          className="p-2"
          onClick={() => {
            setSidebarOpen(!sidebarOpen)
            onClick(!sidebarOpen)
          }}
        >
          {sidebarOpen ? <MenuIcon size={24} /> : <MenuIcon size={24} />}
        </button>
        <h1 className="text-xl font-bold">My Mor</h1>
      </div>
      <div className="flex items-center">
        <Box sx={{ flexGrow: 0, }}>
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
      </div>
      </div>
    </header>
  
  );
}
