import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import "./index.css";

const theme = createTheme({
  palette: {
    primary: {
      main: "#0f6ecd",
      light: "#e3f0fc",
      dark: "#0b57a8",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#00b894",
      light: "#e0faf3",
      dark: "#008f6c",
      contrastText: "#ffffff",
    },
    error: {
      main: "#e74c3c",
      light: "#fde8e8",
    },
    warning: {
      main: "#f39c12",
      light: "#fef3e0",
    },
    success: {
      main: "#00b894",
      light: "#e0faf3",
    },
    background: {
      default: "#f5f7fa",
      paper: "#ffffff",
    },
    text: {
      primary: "#1a1a2e",
      secondary: "#6b7280",
      disabled: "#9ca3af",
    },
    divider: "#e5e7eb",
  },
  typography: {
    fontFamily: '"DM Sans", "Segoe UI", system-ui, sans-serif',
    h1: { fontFamily: '"League Spartan", sans-serif', fontWeight: 700, fontSize: "2rem", lineHeight: 1.1 },
    h2: { fontFamily: '"League Spartan", sans-serif', fontWeight: 600, fontSize: "1.5rem", lineHeight: 1.2 },
    h3: { fontFamily: '"League Spartan", sans-serif', fontWeight: 600, fontSize: "1.25rem", lineHeight: 1.3 },
    h4: { fontFamily: '"League Spartan", sans-serif', fontWeight: 600, fontSize: "1.125rem", lineHeight: 1.3 },
    h5: { fontFamily: '"League Spartan", sans-serif', fontWeight: 600, fontSize: "1rem", lineHeight: 1.4 },
    h6: { fontFamily: '"League Spartan", sans-serif', fontWeight: 600, fontSize: "0.875rem", lineHeight: 1.4 },
    body1: { fontFamily: '"DM Sans", sans-serif', fontSize: "0.875rem", lineHeight: 1.6 },
    body2: { fontFamily: '"DM Sans", sans-serif', fontSize: "0.8rem", lineHeight: 1.5 },
    button: { fontFamily: '"DM Sans", sans-serif', fontWeight: 600, textTransform: "none", fontSize: "0.875rem" },
    caption: { fontFamily: '"DM Sans", sans-serif', fontSize: "0.7rem", lineHeight: 1.5 },
    overline: { fontFamily: '"DM Sans", sans-serif', fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: "10px 20px",
          fontWeight: 600,
          fontSize: "0.875rem",
          boxShadow: "none",
          minHeight: 44,
          "&:hover": { boxShadow: "none" },
        },
        containedPrimary: {
          background: "linear-gradient(135deg, #0f6ecd 0%, #0b57a8 100%)",
          "&:hover": { background: "linear-gradient(135deg, #0b57a8 0%, #084585 100%)" },
        },
        containedSecondary: {
          background: "linear-gradient(135deg, #00b894 0%, #008f6c 100%)",
          "&:hover": { background: "linear-gradient(135deg, #008f6c 0%, #007a58 100%)" },
        },
      },
      defaultProps: {
        disableElevation: true,
        variant: "contained",
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
          border: "1px solid #f3f4f6",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 12,
            "& fieldset": { borderColor: "#e5e7eb" },
            "&:hover fieldset": { borderColor: "#0f6ecd" },
            "&.Mui-focused fieldset": { borderColor: "#0f6ecd", borderWidth: 2 },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: "none",
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          minWidth: 0,
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
