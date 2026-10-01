import { ApolloProvider } from "@apollo/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import client from "./graphql/client";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { RequirePerm, RequireSuperAdmin } from "./components/AdminRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MerchantRegister from "./pages/MerchantRegister";
import VerifyOtp from "./pages/VerifyOtp";
import Dashboard from "./pages/Dashboard";
import WalletPage from "./pages/Wallet";
import SendMoney from "./pages/SendMoney";
import CashIn from "./pages/CashIn";
import CashOut from "./pages/CashOut";
import QrPayment from "./pages/QrPayment";
import TransactionsPage from "./pages/Transactions";
import MasterList from "./pages/MasterList";
import Profile from "./pages/Profile";
import NotificationsPage from "./pages/Notifications";
import AdminDashboard from "./pages/AdminDashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import SuperAdminUsers from "./pages/SuperAdminUsers";
import WalletBalances from "./pages/WalletBalances";
import AccountDetail from "./pages/AccountDetail";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import SessionGuard from "./components/SessionGuard";

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
              <Route path="/register-merchant" element={<MerchantRegister />} />
              <Route path="/verify-otp" element={<VerifyOtp />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/wallet" element={<WalletPage />} />
                <Route path="/send" element={<SendMoney />} />
                <Route path="/cash-in" element={<RequirePerm perm="cash:operate"><CashIn /></RequirePerm>} />
                <Route path="/cash-out" element={<RequirePerm perm="cash:operate"><CashOut /></RequirePerm>} />
                <Route path="/qr-payment" element={<QrPayment />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/master-list" element={<RequirePerm perm="masterlist:read"><MasterList /></RequirePerm>} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/admin" element={<RequirePerm perm="users:read"><AdminDashboard /></RequirePerm>} />
                <Route path="/super-admin" element={<RequireSuperAdmin><SuperAdminDashboard /></RequireSuperAdmin>} />
                <Route path="/super-admin/users" element={<RequireSuperAdmin><SuperAdminUsers /></RequireSuperAdmin>} />
                <Route path="/admin/accounts/:id" element={<RequirePerm perm="users:read"><AccountDetail /></RequirePerm>} />
                <Route path="/wallet-balances" element={<RequirePerm perm="platform:stats"><WalletBalances /></RequirePerm>} />
              </Route>
            </Routes>
            <PwaInstallPrompt />
            <SessionGuard />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ApolloProvider>
  );
}