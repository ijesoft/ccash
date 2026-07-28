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
  Badge,
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
import CallReceivedIcon from "@mui/icons-material/CallReceived";
import CallMadeIcon from "@mui/icons-material/CallMade";
import { useQuery } from "@apollo/client";
import { UNREAD_COUNT } from "../graphql/queries/wallet";
import { useAuth } from "../context/AuthContext";

const DRAWER_WIDTH = 260;

const primaryNav = [
  { label: "Home", icon: <HomeIcon />, path: "/" },
  { label: "Wallet", icon: <AccountBalanceWalletIcon />, path: "/wallet" },
  { label: "Send", icon: <SendIcon />, path: "/send" },
  { label: "QR", icon: <QrCodeIcon />, path: "/qr-payment" },
  { label: "History", icon: <ReceiptIcon />, path: "/transactions" },
];

const secondaryNav = [
  { label: "Cash In", icon: <CallReceivedIcon />, path: "/cash-in" },
  { label: "Cash Out", icon: <CallMadeIcon />, path: "/cash-out" },
  { label: "Notifications", icon: <NotificationsNoneIcon />, path: "/notifications" },
  { label: "Profile", icon: <PersonIcon />, path: "/profile" },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { data: unreadData } = useQuery<{ unreadCount: number }>(UNREAD_COUNT, { pollInterval: 20000 });
  const unreadCount = unreadData?.unreadCount ?? 0;

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
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Toolbar sx={{ justifyContent: "flex-start", gap: 1.5, py: 2.5, px: 2.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            background: "linear-gradient(135deg, #0f6ecd 0%, #084585 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 700,
            fontFamily: '"League Spartan", sans-serif',
            fontSize: "0.9rem",
          }}
        >
          C
        </Box>
        <Typography
          variant="h6"
          fontWeight={700}
          sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main", letterSpacing: "-0.02em" }}
        >
          CCash
        </Typography>
      </Toolbar>

      <List sx={{ px: 1, flex: 1 }}>
        {primaryNav.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={currentPath === item.path}
              onClick={() => handleNavigate(item.path)}
              sx={{
                borderRadius: 2,
                mx: 1,
                my: 0.35,
                minHeight: 48,
                "&.Mui-selected": {
                  backgroundColor: "primary.light",
                  color: "primary.dark",
                  "& .MuiListItemIcon-root": { color: "primary.main" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: "text.secondary" }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 500, fontSize: "0.9rem" }} />
            </ListItemButton>
          </ListItem>
        ))}

        <Box sx={{ borderTop: 1, borderColor: "divider", mx: 2, my: 1.5 }} />

        {secondaryNav.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={currentPath === item.path}
              onClick={() => handleNavigate(item.path)}
              sx={{
                borderRadius: 2,
                mx: 1,
                my: 0.35,
                minHeight: 48,
                "&.Mui-selected": {
                  backgroundColor: "primary.light",
                  color: "primary.dark",
                  "& .MuiListItemIcon-root": { color: "primary.main" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: "text.secondary" }}>
                {item.path === "/notifications" ? (
                  <Badge color="error" badgeContent={unreadCount} max={9} invisible={unreadCount === 0}>
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 500, fontSize: "0.9rem" }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Box sx={{ borderTop: 1, borderColor: "divider", p: 1, pb: { xs: 2, md: 1 } }}>
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
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh" }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          bgcolor: "rgba(255,255,255,0.92)",
          color: "text.primary",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid",
          borderColor: "divider",
          pt: "var(--safe-top)",
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between", minHeight: { xs: 56, sm: 64 }, px: { xs: 1.5, sm: 2 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
            {isMobile && (
              <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Open menu" sx={{ mr: 0.5 }}>
                <MenuIcon />
              </IconButton>
            )}
            <Typography
              variant="h6"
              fontWeight={700}
              noWrap
              sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main", letterSpacing: "-0.02em" }}
            >
              CCash
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <IconButton
              size="medium"
              onClick={() => handleNavigate("/notifications")}
              aria-label="Notifications"
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <Badge
                color="error"
                badgeContent={unreadCount}
                max={9}
                invisible={unreadCount === 0}
                sx={{ "& .MuiBadge-badge": { fontSize: "0.6rem", height: 16, minWidth: 16 } }}
              >
                <NotificationsNoneIcon />
              </Badge>
            </IconButton>
            <IconButton
              size="medium"
              onClick={() => handleNavigate("/profile")}
              aria-label="Profile"
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: "secondary.main",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                }}
              >
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
            zIndex: { xs: 1400, md: 1300 },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: DRAWER_WIDTH,
              borderRight: "1px solid",
              borderColor: "divider",
            },
          }}
        >
          {drawer}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: DRAWER_WIDTH,
              borderRight: "1px solid",
              borderColor: "divider",
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2.5, md: 3 },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          pb: { xs: "calc(88px + var(--safe-bottom))", md: 3 },
          mt: { xs: 7, md: 8 },
          minHeight: "100dvh",
          maxWidth: { xs: "100%", md: 960 },
          mx: "auto",
        }}
      >
        <Outlet />
      </Box>

      {isMobile && !mobileOpen && (
        <BottomNavigation
          showLabels
          value={primaryNav.some((n) => n.path === currentPath) ? currentPath : false}
          onChange={handleBottomNav}
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1300,
            bgcolor: "rgba(255,255,255,0.96)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid",
            borderColor: "divider",
            height: "calc(64px + var(--safe-bottom))",
            pb: "var(--safe-bottom)",
            "& .MuiBottomNavigationAction-root": {
              minWidth: 0,
              px: 0.5,
              py: 0.75,
            },
          }}
        >
          {primaryNav.map((item) => (
            <BottomNavigationAction
              key={item.path}
              label={item.label}
              value={item.path}
              icon={item.icon}
              sx={{
                "&.Mui-selected": { color: "primary.main" },
                "& .MuiBottomNavigationAction-label": {
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  mt: 0.25,
                },
              }}
            />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
}
