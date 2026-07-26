import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  AppBar,
  Avatar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  BottomNavigation,
  BottomNavigationAction,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import SendIcon from "@mui/icons-material/Send";
import ReceiptIcon from "@mui/icons-material/Receipt";
import QrCodeIcon from "@mui/icons-material/QrCode";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import PersonIcon from "@mui/icons-material/Person";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../context/AuthContext";

const DRAWER_WIDTH = 260;

const navItems = [
  { label: "Home", icon: <HomeIcon />, path: "/" },
  { label: "Wallet", icon: <AccountBalanceWalletIcon />, path: "/wallet" },
  { label: "Send", icon: <SendIcon />, path: "/send" },
  { label: "QR", icon: <QrCodeIcon />, path: "/qr-payment" },
  { label: "History", icon: <ReceiptIcon />, path: "/transactions" },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const currentPath = location.pathname;
  const initials = user?.email?.charAt(0).toUpperCase() ?? "U";

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const handleBottomNav = (_event: React.SyntheticEvent, newValue: string) => {
    handleNavigate(newValue);
  };

  const drawer = (
    <Box>
      <Toolbar sx={{ justifyContent: "center", py: 2 }}>
        <Typography variant="h6" fontWeight={700} sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main" }}>
          CCash
        </Typography>
      </Toolbar>
      <Box sx={{ borderBottom: 1, borderColor: "divider", mx: 2, mb: 1 }} />
      <List>
        {navItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={currentPath === item.path}
              onClick={() => handleNavigate(item.path)}
              sx={{
                borderRadius: 2,
                mx: 1,
                my: 0.5,
                minHeight: 48,
                "&.Mui-selected": {
                  backgroundColor: "primary.light",
                  color: "primary.main",
                  fontWeight: 600,
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 500 }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Box sx={{ borderTop: 1, borderColor: "divider", mx: 2, my: 2 }} />
      <List>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => { if (isMobile) setMobileOpen(false); }}
            sx={{ borderRadius: 2, mx: 1, my: 0.5, minHeight: 48 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <PersonIcon />
            </ListItemIcon>
            <ListItemText primary="Profile" primaryTypographyProps={{ fontWeight: 500 }} />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => {
              logout();
              handleNavigate("/login");
            }}
            sx={{ borderRadius: 2, mx: 1, my: 0.5, minHeight: 48, color: "error.main" }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: "error.main" }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Logout" primaryTypographyProps={{ fontWeight: 500 }} />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          bgcolor: "background.paper",
          color: "text.primary",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {isMobile && (
              <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="h6" fontWeight={700} sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main" }}>
              CCash
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton size="small" onClick={() => handleNavigate("/notifications")} sx={{ position: "relative" }}>
              <NotificationsNoneIcon />
            </IconButton>
            <IconButton size="small" onClick={() => handleNavigate("/profile")}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: "secondary.main" }}>
                {initials}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": { boxSizing: "border-box", width: DRAWER_WIDTH },
          }}
        >
          {drawer}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { boxSizing: "border-box", width: DRAWER_WIDTH } }}
          open
        >
          {drawer}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          pb: { xs: 10, md: 3 },
          mt: { xs: 6, md: 8 },
          minHeight: "100vh",
          maxWidth: { xs: "100%", md: "1200px", lg: "960px" },
          mx: "auto",
        }}
      >
        <Outlet />
      </Box>

      {isMobile && (
        <BottomNavigation
          showLabels
          value={currentPath}
          onChange={handleBottomNav}
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1300,
            bgcolor: "background.paper",
            borderTop: "1px solid",
            borderColor: "divider",
            boxShadow: "0 -2px 8px rgba(0,0,0,0.04)",
          }}
        >
          {navItems.map((item) => (
            <BottomNavigationAction
              key={item.path}
              label={item.label}
              value={item.path}
              icon={item.icon}
              sx={{
                "&.Mui-selected": { color: "primary.main" },
                "& .MuiBottomNavigationAction-label": { fontSize: "0.6875rem", fontWeight: 500 },
              }}
            />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
}