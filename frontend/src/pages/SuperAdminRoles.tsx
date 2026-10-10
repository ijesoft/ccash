import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@apollo/client";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import LockIcon from "@mui/icons-material/Lock";
import { GET_ROLE_PERMISSIONS, UPDATE_ROLE_PERMISSIONS } from "../graphql/queries/admin";

type Role = "MEMBER" | "MERCHANT" | "ADMIN";
const EDITABLE_ROLES: Role[] = ["MEMBER", "MERCHANT", "ADMIN"];

const GROUPS: { title: string; perms: { value: string; label: string }[] }[] = [
  {
    title: "Users",
    perms: [
      { value: "users:read", label: "View users" },
      { value: "users:create", label: "Create members" },
      { value: "users:update", label: "Edit profiles" },
      { value: "users:suspend", label: "Suspend / activate" },
      { value: "users:delete", label: "Delete accounts" },
      { value: "users:reset-password", label: "Reset passwords" },
      { value: "users:recover-password", label: "Approve password recovery requests" },
      { value: "users:change-role", label: "Change roles" },
      { value: "users:set-id", label: "Set member ID" },
    ],
  },
  {
    title: "Merchants",
    perms: [
      { value: "merchants:read", label: "View merchants" },
      { value: "merchants:update", label: "Edit merchants" },
      { value: "merchants:set-id", label: "Set merchant ID" },
    ],
  },
  {
    title: "Transactions & Cash",
    perms: [
      { value: "transactions:read-all", label: "Read all transactions" },
      { value: "cash:operate", label: "Cash in / out" },
    ],
  },
  {
    title: "Reports & Master List",
    perms: [
      { value: "reports:export", label: "Export reports" },
      { value: "masterlist:read", label: "View master list" },
      { value: "masterlist:write", label: "Edit master list" },
    ],
  },
  {
    title: "Platform",
    perms: [
      { value: "platform:stats", label: "Platform stats" },
      { value: "branding:write", label: "Edit branding" },
      { value: "kyc:review", label: "Review KYC" },
    ],
  },
];

interface RoleRow {
  role: string;
  permissions: string[];
}

export default function SuperAdminRoles() {
  const { data, loading, error } = useQuery<{ rolePermissions: RoleRow[] }>(GET_ROLE_PERMISSIONS);
  const [updateRole, { loading: saving }] = useMutation(UPDATE_ROLE_PERMISSIONS);
  const [draft, setDraft] = useState<Record<Role, string[]>>({ MEMBER: [], MERCHANT: [], ADMIN: [] });
  const [saved, setSaved] = useState<Record<Role, string[]>>({ MEMBER: [], MERCHANT: [], ADMIN: [] });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !data?.rolePermissions) return;
    initialized.current = true;
    const next = { MEMBER: [] as string[], MERCHANT: [] as string[], ADMIN: [] as string[] };
    for (const row of data.rolePermissions) {
      if (row.role === "MEMBER" || row.role === "MERCHANT" || row.role === "ADMIN") {
        next[row.role] = [...row.permissions].sort();
      }
    }
    setDraft(next);
    setSaved(next);
  }, [data]);

  const dirty = useMemo<Record<Role, boolean>>(
    () => ({
      MEMBER: JSON.stringify(draft.MEMBER) !== JSON.stringify(saved.MEMBER),
      MERCHANT: JSON.stringify(draft.MERCHANT) !== JSON.stringify(saved.MERCHANT),
      ADMIN: JSON.stringify(draft.ADMIN) !== JSON.stringify(saved.ADMIN),
    }),
    [draft, saved],
  );

  const toggle = (role: Role, perm: string) => {
    setDraft((d) => ({
      ...d,
      [role]: d[role].includes(perm)
        ? d[role].filter((p) => p !== perm).sort()
        : [...d[role], perm].sort(),
    }));
  };

  const save = async (role: Role) => {
    try {
      await updateRole({ variables: { role, permissions: draft[role] } });
      setSaved((s) => ({ ...s, [role]: [...draft[role]] }));
      setSnackbar({ open: true, message: `${role} permissions saved — applies on next login`, severity: "success" });
    } catch (err: unknown) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : "Save failed", severity: "error" });
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight="bold">Roles & Access</Typography>
        <Chip icon={<SupervisorAccountIcon />} label="SUPER ADMIN" color="error" variant="outlined" size="small" />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Toggle what each role can do. SUPER_ADMIN always keeps every permission. Changes apply when a user next
        logs in or refreshes their session.
      </Typography>
      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
        <Table size="small" aria-label="Role permissions matrix">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Permission</TableCell>
              {EDITABLE_ROLES.map((role) => (
                <TableCell key={role} align="center" sx={{ fontWeight: 700 }}>
                  {role}
                </TableCell>
              ))}
              <TableCell align="center" sx={{ fontWeight: 700 }}>
                <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                  <span>SUPER_ADMIN</span>
                  <LockIcon fontSize="inherit" color="disabled" />
                </Stack>
              </TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {GROUPS.map((group) => (
              <Fragment key={group.title}>
                <TableRow>
                  <TableCell colSpan={6} sx={{ fontWeight: 700, bgcolor: "action.hover" }}>
                    {group.title}
                  </TableCell>
                </TableRow>
                {group.perms.map((perm) => (
                  <TableRow key={perm.value}>
                    <TableCell>{perm.label} <Typography component="span" variant="caption" color="text.secondary">{perm.value}</Typography></TableCell>
                    {EDITABLE_ROLES.map((role) => (
                      <TableCell key={role} align="center">
                        <Checkbox
                          checked={draft[role].includes(perm.value)}
                          onChange={() => toggle(role, perm.value)}
                          disabled={loading}
                          inputProps={{ "aria-label": `${perm.value} for ${role}` }}
                        />
                      </TableCell>
                    ))}
                    <TableCell align="center">
                      <Checkbox checked disabled inputProps={{ "aria-label": `${perm.value} for SUPER_ADMIN (locked)` }} />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </Fragment>
            ))}
            <TableRow>
              <TableCell />
              {EDITABLE_ROLES.map((role) => (
                <TableCell key={role} align="center">
                  <Button
                    variant="contained"
                    size="small"
                    disabled={!dirty[role] || saving || loading}
                    onClick={() => save(role)}
                  >
                    Save {role}
                  </Button>
                </TableCell>
              ))}
              <TableCell />
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </Paper>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Failed to load permissions: {error.message}
        </Alert>
      )}
      {loading && (
        <Typography variant="body2" color="text.secondary" mt={2}>Loading permissions…</Typography>
      )}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
