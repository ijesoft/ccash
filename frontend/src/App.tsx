import { ApolloProvider } from "@apollo/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import client from "./graphql/client";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyOtp from "./pages/VerifyOtp";
import Dashboard from "./pages/Dashboard";
import WalletPage from "./pages/Wallet";
import SendMoney from "./pages/SendMoney";
import CashIn from "./pages/CashIn";
import CashOut from "./pages/CashOut";
import QrPayment from "./pages/QrPayment";
import TransactionsPage from "./pages/Transactions";
import Profile from "./pages/Profile";
import NotificationsPage from "./pages/Notifications";
import AdminDashboard from "./pages/AdminDashboard";

const queryClient = new QueryClient();

export default function App() {
  return (
    <ApolloProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-otp" element={<VerifyOtp />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/wallet" element={<WalletPage />} />
                <Route path="/send" element={<SendMoney />} />
                <Route path="/cash-in" element={<CashIn />} />
                <Route path="/cash-out" element={<CashOut />} />
                <Route path="/qr-payment" element={<QrPayment />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/admin" element={<AdminDashboard />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ApolloProvider>
  );
}