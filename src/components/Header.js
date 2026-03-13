import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MenuIcon, Building2 } from "lucide-react";
import "../index.css";
import Menu from "@mui/material/Menu";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import logoImage from "../assets/logo1.png";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import { useDispatch, useSelector } from "react-redux";
import { logoutAdmin } from "../app/features/AuthSlice";

export default function Header({ onClick }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [anchorElUser, setAnchorElUser] = useState(null);

  const navigate = useNavigate();
  const dispatch = useDispatch();

  const activeOrg = useSelector((state) => state.auth.activeOrg);
  const employee = useSelector((state) => state.auth.employee);

  const isBusiness = activeOrg === "business";

  const settings = useMemo(() => {
    const items = [];

    if (isBusiness) {
      items.push("BusinessProfile");
    }

    items.push("ChangePassword");
    items.push("Logout");

    return items;
  }, [isBusiness]);

  const handleOpenUserMenu = (event) => {
    setAnchorElUser(event.currentTarget);
  };

  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };

  const handleLogout = () => {
    dispatch(logoutAdmin());
    handleCloseUserMenu();
  };

  const handleMenuSelect = (setting) => {
    if (setting === "BusinessProfile") {
      navigate("/business");
    } else if (setting === "ChangePassword") {
      navigate("/changepassword");
    } else if (setting === "Logout") {
      handleLogout();
      return;
    }

    handleCloseUserMenu();
  };

  const displayName =
    employee?.name || employee?.fullName || employee?.email || "Admin";

  return (
    <header className="bg-blue-600 text-white p-2 header">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            className="p-2"
            onClick={() => {
              setSidebarOpen(!sidebarOpen);
              onClick(!sidebarOpen);
            }}
          >
            <MenuIcon size={24} />
          </button>

          <h1 className="text-xl font-bold">My Mor</h1>
        </div>

        <div className="flex items-center gap-3">
         
          <Box sx={{ flexGrow: 0 }}>
            <Tooltip title={displayName}>
              <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                <Avatar alt={displayName} src={logoImage} />
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
                <MenuItem key={setting} onClick={() => handleMenuSelect(setting)}>
                  {setting === "BusinessProfile" && (
                    <ListItemIcon>
                      <Building2 size={18} />
                    </ListItemIcon>
                  )}

                  <Typography textAlign="center">
                    {setting === "BusinessProfile"
                      ? "Business Profile"
                      : setting === "ChangePassword"
                      ? "Change Password"
                      : "Logout"}
                  </Typography>
                </MenuItem>
              ))}
            </Menu>
          </Box>
        </div>
      </div>
    </header>
  );
}