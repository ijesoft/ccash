import { useState } from "react";
import { useNavigate, useParams, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Stack,
  Button,
  TextField,
  Divider,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Alert,
  Snackbar,
  Link,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import BadgeIcon from "@mui/icons-material/Badge";
import LockResetIcon from "@mui/icons-material/LockReset";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BlockIcon from "@mui/icons-material/Block";
import { useQuery, useMutation } from "@apollo/client";
import {
  GET_ADMIN_ACCOUNT_DETAIL,
  GET_ADMIN_USER_TRANSACTIONS,
  ADMIN_UPDATE_MEMBER_PROFILE,
  ADMIN_UPDATE_MERCHANT_PROFILE,
  ADMIN_DELETE_ACCOUNT,
  ADMIN_SET_MEMBER_ID,
  ADMIN_SET_MERCHANT_ID,
  ACTIVATE_USER,
  SUSPEND_USER,
} from "../graphql/queries/admin";
import { formatMoney } from "../utils/format";
import AccountExportMenu from "../components/AccountExportMenu";
import SetIdDialog from "../components/SetIdDialog";
import ResetPasswordDialog from "../components/ResetPasswordDialog";
import ConfirmDialog from "../components/ConfirmDialog";

interface MemberForm {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  mobile: string;
}

interface MerchantForm {
  companyName: string;
  contactPerson: string;
  mobileNo: string;
  landline: string;
  address: string;
  tin: string;
  email: string;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [memberForm, setMemberForm] = useState<MemberForm | null>(null);
  const [merchantForm, setMerchantForm] = useState<MerchantForm | null>(null);
  const [formError, setFormError] = useState("");
  const [setIdOpen, setSetIdOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const { data, loading, error, refetch } = useQuery(GET_ADMIN_ACCOUNT_DETAIL, {
    variables: { userId: id },
    skip: !id,
  });
  const account = data?.adminAccountDetail;

  const { data: txData, loading: txLoading } = useQuery(GET_ADMIN_USER_TRANSACTIONS, {
    variables: { userId: id, limit: 10, offset: 0 },
    skip: !id,
  });
  const transactions = txData?.adminUserTransactions ?? [];

  const [updateMemberProfile, { loading: savingMember }] = useMutation(ADMIN_UPDATE_MEMBER_PROFILE);
  const [updateMerchantProfile, { loading: savingMerchant }] = useMutation(ADMIN_UPDATE_MERCHANT_PROFILE);
  const [deleteAccount] = useMutation(ADMIN_DELETE_ACCOUNT);
  const [activateUser] = useMutation(ACTIVATE_USER);
  const [suspendUser] = useMutation(SUSPEND_USER);
  const [setMemberId] = useMutation(ADMIN_SET_MEMBER_ID);
  const [setMerchantId] = useMutation(ADMIN_SET_MERCHANT_ID);

  const isMerchant = account?.role === "MERCHANT";

  const startEditing = () => {
    if (!account) return;
    if (isMerchant) {
      setMerchantForm({
        companyName: account.merchant?.companyName ?? "",
        contactPerson: account.merchant?.contactPerson ?? "",
        mobileNo: account.merchant?.mobileNo ?? account.phone ?? "",
        landline: account.merchant?.landline ?? "",
        address: account.merchant?.address ?? "",
        tin: account.merchant?.tin ?? "",
        email: account.email ?? "",
      });
    } else {
      setMemberForm({
        firstName: account.firstName ?? "",
        middleName: account.middleName ?? "",
        lastName: account.lastName ?? "",
        email: account.email ?? "",
        mobile: account.phone ?? "",
      });
    }
    setFormError("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setMemberForm(null);
    setMerchantForm(null);
    setFormError("");
  };

  const handleSave = async () => {
    setFormError("");
    try {
      if (isMerchant && merchantForm) {
        await updateMerchantProfile({
          variables: {
            userId: id,
            input: {
              companyName: merchantForm.companyName,
              contactPerson: merchantForm.contactPerson,
              mobileNo: merchantForm.mobileNo,
              landline: merchantForm.landline || null,
              address: merchantForm.address,
              tin: merchantForm.tin,
              email: merchantForm.email,
            },
          },
        });
      } else if (memberForm) {
        await updateMemberProfile({
          variables: {
            userId: id,
            input: {
              firstName: memberForm.firstName,
              middleName: memberForm.middleName || null,
              lastName: memberForm.lastName,
              email: memberForm.email,
              mobile: memberForm.mobile,
            },
          },
        });
      }
      setEditing(false);
      await refetch();
      setSnackbar({ open: true, message: "Profile updated", severity: "success" });
    } catch (err: any) {
      setFormError(err.message || "Failed to save changes");
    }
  };

  const handleToggleStatus = async () => {
    if (!account) return;
    try {
      if (account.status === "ACTIVE") {
        await suspendUser({ variables: { userId: id } });
        setSnackbar({ open: true, message: "Account suspended", severity: "success" });
      } else {
        await activateUser({ variables: { userId: id } });
        setSnackbar({ open: true, message: "Account activated", severity: "success" });
      }
      await refetch();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || "Failed to update status", severity: "error" });
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !account) {
    return (
      <Box>
        <Alert severity="error">Could not load this account.</Alert>
        <Button component={RouterLink} to="/admin" sx={{ mt: 2 }} startIcon={<ArrowBackIcon />}>
          Back to Admin Dashboard
        </Button>
      </Box>
    );
  }

  const label = isMerchant
    ? account.merchant?.companyName ?? account.email
    : `${account.firstName ?? ""} ${account.lastName ?? ""}`.trim() || account.email;

  return (
    <Box className="animate-fade-in">
      <Link component={RouterLink} to="/admin" underline="hover" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mb: 2 }}>
        <ArrowBackIcon fontSize="small" /> Back to Admin Dashboard
      </Link>

      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" rowGap={1} mb={3}>
        <Box>
          <Typography fontWeight={700} sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: "1.5rem" }}>
            {label}
          </Typography>
          <Stack direction="row" spacing={1} mt={0.5}>
            <Chip label={account.role} size="small" color={account.role === "ADMIN" ? "primary" : account.role === "MERCHANT" ? "secondary" : "default"} variant="outlined" />
            <Chip label={account.status} size="small" color={account.status === "ACTIVE" ? "success" : account.status === "SUSPENDED" ? "error" : "warning"} />
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
          <AccountExportMenu accountId={account.id} accountLabel={label} />
          {!editing && (
            <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={startEditing}>
              Edit
            </Button>
          )}
          {account.role !== "MERCHANT" && (
            <Button size="small" variant="outlined" startIcon={<BadgeIcon />} onClick={() => setSetIdOpen(true)}>
              {account.idNo ? "Change ID No." : "Set ID No."}
            </Button>
          )}
          {isMerchant && (
            <Button size="small" variant="outlined" startIcon={<BadgeIcon />} onClick={() => setSetIdOpen(true)}>
              Change Merchant ID
            </Button>
          )}
          <Button size="small" variant="outlined" color="warning" startIcon={<LockResetIcon />} onClick={() => setResetPasswordOpen(true)}>
            Reset Password
          </Button>
          <Button
            size="small"
            variant="outlined"
            color={account.status === "ACTIVE" ? "error" : "success"}
            startIcon={account.status === "ACTIVE" ? <BlockIcon /> : <CheckCircleIcon />}
            onClick={handleToggleStatus}
          >
            {account.status === "ACTIVE" ? "Suspend" : "Activate"}
          </Button>
          <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
        <Box sx={{ flex: 2 }}>
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Profile</Typography>
              {formError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{formError}</Alert>}

              {!editing ? (
                <Stack spacing={1.5} divider={<Divider flexItem />}>
                  {isMerchant ? (
                    <>
                      <Row label="Company / Name" value={account.merchant?.companyName} />
                      <Row label="Contact Person" value={account.merchant?.contactPerson} />
                      <Row label="Mobile No." value={account.merchant?.mobileNo} />
                      <Row label="Landline" value={account.merchant?.landline ?? "—"} />
                      <Row label="Address" value={account.merchant?.address} />
                      <Row label="TIN" value={account.merchant?.tin} />
                      <Row label="Merchant ID" value={account.merchant?.merchantIdNo ?? "Not set"} />
                    </>
                  ) : (
                    <>
                      <Row
                        label="Name"
                        value={`${account.firstName ?? ""} ${account.middleName ?? ""} ${account.lastName ?? ""}`.replace(/\s+/g, " ").trim() || "—"}
                      />
                      <Row label="ID No." value={account.idNo ?? "Not set"} />
                    </>
                  )}
                  <Row label="Email" value={account.email} />
                  <Row label="Mobile" value={account.phone} />
                  <Row label="KYC Level" value={account.kycLevel} />
                  <Row label="Joined" value={formatDate(account.createdAt)} />
                </Stack>
              ) : isMerchant && merchantForm ? (
                <Stack spacing={1.5}>
                  <TextField label="Company / Name" value={merchantForm.companyName} onChange={(e) => setMerchantForm({ ...merchantForm, companyName: e.target.value })} fullWidth />
                  <TextField label="Contact Person" value={merchantForm.contactPerson} onChange={(e) => setMerchantForm({ ...merchantForm, contactPerson: e.target.value })} fullWidth />
                  <TextField
                    label="Mobile No."
                    value={merchantForm.mobileNo}
                    onChange={(e) => setMerchantForm({ ...merchantForm, mobileNo: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                    inputProps={{ inputMode: "numeric", maxLength: 11 }}
                    fullWidth
                  />
                  <TextField label="Landline" value={merchantForm.landline} onChange={(e) => setMerchantForm({ ...merchantForm, landline: e.target.value })} fullWidth />
                  <TextField label="Address" value={merchantForm.address} onChange={(e) => setMerchantForm({ ...merchantForm, address: e.target.value })} fullWidth multiline minRows={2} />
                  <TextField label="TIN" value={merchantForm.tin} onChange={(e) => setMerchantForm({ ...merchantForm, tin: e.target.value })} fullWidth />
                  <TextField label="Email" type="email" value={merchantForm.email} onChange={(e) => setMerchantForm({ ...merchantForm, email: e.target.value })} fullWidth />
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button onClick={cancelEditing}>Cancel</Button>
                    <Button variant="contained" onClick={handleSave} disabled={savingMerchant}>
                      {savingMerchant ? "Saving..." : "Save"}
                    </Button>
                  </Stack>
                </Stack>
              ) : memberForm ? (
                <Stack spacing={1.5}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField label="Last Name" value={memberForm.lastName} onChange={(e) => setMemberForm({ ...memberForm, lastName: e.target.value })} fullWidth />
                    <TextField label="First Name" value={memberForm.firstName} onChange={(e) => setMemberForm({ ...memberForm, firstName: e.target.value })} fullWidth />
                  </Stack>
                  <TextField label="Middle Name" value={memberForm.middleName} onChange={(e) => setMemberForm({ ...memberForm, middleName: e.target.value })} fullWidth />
                  <TextField label="Email" type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} fullWidth />
                  <TextField
                    label="Mobile"
                    value={memberForm.mobile}
                    onChange={(e) => setMemberForm({ ...memberForm, mobile: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                    inputProps={{ inputMode: "numeric", maxLength: 11 }}
                    fullWidth
                  />
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button onClick={cancelEditing}>Cancel</Button>
                    <Button variant="contained" onClick={handleSave} disabled={savingMember}>
                      {savingMember ? "Saving..." : "Save"}
                    </Button>
                  </Stack>
                </Stack>
              ) : null}
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: 1 }}>
          <Card sx={{ mb: 3, borderRadius: 3, bgcolor: "primary.light" }}>
            <CardContent>
              <Typography variant="body2" color="primary.dark">Wallet Balance</Typography>
              <Typography variant="h4" fontWeight="bold" color="primary.dark">
                {formatMoney(account.walletBalanceCents)}
              </Typography>
              <Chip label={account.walletStatus} size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Recent Transactions</Typography>
              {txLoading && (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
              {!txLoading && transactions.length === 0 && (
                <Typography variant="body2" color="text.secondary">No transactions yet.</Typography>
              )}
              {!txLoading && transactions.length > 0 && (
                <List disablePadding>
                  {transactions.map((tx: any) => (
                    <ListItem key={tx.id} disableGutters divider sx={{ py: 1 }}>
                      <ListItemText
                        primary={`${tx.direction === "IN" ? "Received" : "Sent"}${tx.counterparty?.name ? ` · ${tx.counterparty.name}` : ""}`}
                        secondary={formatDate(tx.createdAt)}
                      />
                      <Typography fontWeight={700} color={tx.direction === "IN" ? "success.main" : "warning.main"}>
                        {tx.direction === "IN" ? "+" : "−"}{formatMoney(tx.amount.cents)}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Box>
      </Stack>

      {!isMerchant ? (
        <SetIdDialog
          open={setIdOpen}
          onClose={() => setSetIdOpen(false)}
          title="Set Member ID No."
          label="ID No."
          helperText="9-digit Member/Admin login ID"
          initialValue={account.idNo}
          maxLength={9}
          transform={(raw) => raw.replace(/\D/g, "")}
          isValid={(v) => /^\d{9}$/.test(v)}
          invalidMessage="ID No. must be exactly 9 digits"
          onSubmit={async (value) => {
            await setMemberId({ variables: { userId: account.id, idNo: value } });
            await refetch();
            setSnackbar({ open: true, message: "ID No. updated", severity: "success" });
          }}
        />
      ) : (
        <SetIdDialog
          open={setIdOpen}
          onClose={() => setSetIdOpen(false)}
          title="Set Merchant ID"
          label="Merchant ID"
          helperText="'M' followed by 9 digits"
          initialValue={account.merchant?.merchantIdNo}
          maxLength={10}
          transform={(raw) => {
            const digits = raw.toUpperCase().replace(/[^0-9]/g, "");
            return digits ? `M${digits}` : "";
          }}
          isValid={(v) => /^M\d{9}$/.test(v)}
          invalidMessage="Merchant ID must be 'M' followed by 9 digits"
          onSubmit={async (value) => {
            await setMerchantId({ variables: { userId: account.id, merchantIdNo: value } });
            await refetch();
            setSnackbar({ open: true, message: "Merchant ID updated", severity: "success" });
          }}
        />
      )}

      {resetPasswordOpen && (
        <ResetPasswordDialog
          open={resetPasswordOpen}
          onClose={() => setResetPasswordOpen(false)}
          userId={account.id}
          email={account.email}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Account"
        message={`This soft-deletes ${label}'s account — they will no longer be able to log in. Transaction history is kept. This is blocked if the wallet balance is not zero.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={async () => {
          await deleteAccount({ variables: { userId: account.id } });
          navigate("/admin");
        }}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" fontWeight={600} sx={{ textAlign: "right", wordBreak: "break-word" }}>{value || "—"}</Typography>
    </Box>
  );
}
