import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useMutation, useQuery } from "@apollo/client";
import AddIcon from "@mui/icons-material/Add";
import { CREDIT_MEMOS } from "../graphql/queries/creditMemos";
import { CANCEL_CREDIT_MEMO } from "../graphql/mutations/creditMemos";
import CreditMemoSubmitDialog from "../components/CreditMemoSubmitDialog";
import CreditMemoReviewDialog from "../components/CreditMemoReviewDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import type { CreditMemo, CreditMemoConnection } from "../types";
import { formatMoney } from "../utils/format";

const STATUS_COLORS: Record<string, "warning" | "success" | "error" | "default"> = {
  FOR_REVIEW: "warning",
  APPROVED: "success",
  DECLINED: "error",
  CANCELLED: "default",
};

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CreditMemos() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const adminView = isAdmin || isSuperAdmin;
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selected, setSelected] = useState<CreditMemo | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CreditMemo | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPaginationModel((current) => ({ ...current, page: 0 }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data, loading, refetch } = useQuery<{ creditMemos: CreditMemoConnection }>(
    CREDIT_MEMOS,
    {
      variables: {
        status: status || null,
        search: search || null,
        limit: paginationModel.pageSize,
        offset: paginationModel.page * paginationModel.pageSize,
      },
      fetchPolicy: "cache-and-network",
    },
  );

  const [cancelMemo, { loading: cancelling }] = useMutation(CANCEL_CREDIT_MEMO);

  const rows = data?.creditMemos.items ?? [];
  const total = data?.creditMemos.pagination.total ?? 0;

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelMemo({ variables: { id: cancelTarget.id } });
      setSnackbar({
        open: true,
        message: "Credit memo cancelled",
        severity: "success",
      });
      await refetch();
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.message || "Could not cancel credit memo",
        severity: "error",
      });
      throw err;
    }
  };

  const columns: GridColDef<CreditMemo>[] = useMemo(
    () => [
      { field: "reference", headerName: "Memo", minWidth: 180, flex: 0.8 },
      {
        field: "transactionReference",
        headerName: "Transaction",
        minWidth: 170,
        flex: 0.8,
        valueGetter: (_value, row) =>
          row.transactionReference ?? row.transactionId,
      },
      {
        field: "counterparty",
        headerName: adminView ? "Merchant" : "Customer",
        minWidth: 190,
        flex: 1,
        valueGetter: (_value, row) =>
          adminView ? row.merchant.email : row.customer.email,
      },
      {
        field: "amount",
        headerName: "Amount",
        width: 140,
        valueGetter: (_value, row) => formatMoney(row.amount.cents),
      },
      {
        field: "status",
        headerName: "Status",
        width: 135,
        renderCell: (params) => (
          <Chip
            label={String(params.value).replaceAll("_", " ")}
            color={STATUS_COLORS[String(params.value)] ?? "default"}
            size="small"
          />
        ),
      },
      {
        field: "createdAt",
        headerName: "Submitted",
        width: 180,
        valueGetter: (_value, row) => formatDate(row.createdAt),
      },
      {
        field: "actions",
        headerName: "",
        width: 130,
        sortable: false,
        filterable: false,
        renderCell: (params) => {
          const row = params.row as CreditMemo;
          if (row.status !== "FOR_REVIEW") return null;
          if (adminView) {
            return (
              <Button size="small" onClick={() => setSelected(row)}>
                Review
              </Button>
            );
          }
          return (
            <Button
              size="small"
              color="error"
              onClick={() => setCancelTarget(row)}
            >
              Cancel
            </Button>
          );
        },
      },
    ],
    [adminView],
  );

  return (
    <Box className="animate-fade-in">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={2}
        mb={2.5}
      >
        <Typography
          fontWeight={700}
          sx={{
            fontFamily: '"League Spartan", sans-serif',
            fontSize: { xs: "1.35rem", sm: "1.5rem" },
          }}
        >
          Credit Memos
        </Typography>
        {!adminView && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setSubmitOpen(true)}
            sx={{ borderRadius: 2 }}
          >
            New Credit Memo
          </Button>
        )}
      </Stack>

      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
        <Select
          size="small"
          value={status}
          displayEmpty
          onChange={(event) => {
            setStatus(event.target.value);
            setPaginationModel((current) => ({ ...current, page: 0 }));
          }}
          sx={{ minWidth: 170, borderRadius: 2 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="FOR_REVIEW">For Review</MenuItem>
          <MenuItem value="APPROVED">Approved</MenuItem>
          <MenuItem value="DECLINED">Declined</MenuItem>
          <MenuItem value="CANCELLED">Cancelled</MenuItem>
        </Select>
        <TextField
          size="small"
          placeholder="Search reference, merchant, customer..."
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          sx={{ flexGrow: 1, minWidth: { xs: "100%", sm: 240 } }}
        />
      </Stack>

      {rows.length === 0 && !loading ? (
        <Alert severity="info">
          {adminView
            ? "No credit memos have been submitted."
            : "You have not submitted any credit memos."}
        </Alert>
      ) : (
        <Box sx={{ height: 560, width: "100%" }}>
          <DataGrid
            rows={rows}
            columns={columns}
            loading={loading}
            rowCount={total}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[5, 10, 25]}
            paginationMode="server"
            disableRowSelectionOnClick
            onRowClick={(params) => {
              if (adminView) setSelected(params.row as CreditMemo);
            }}
            sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}
          />
        </Box>
      )}

      <CreditMemoSubmitDialog
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={() => {
          setSnackbar({
            open: true,
            message: "Credit memo submitted for review",
            severity: "success",
          });
          void refetch();
        }}
      />

      <CreditMemoReviewDialog
        memo={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSnackbar({
            open: true,
            message: "Credit memo updated",
            severity: "success",
          });
          void refetch();
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel credit memo?"
        message={
          cancelTarget
            ? `Cancel ${cancelTarget.reference} for ${formatMoney(
                cancelTarget.amount.cents,
              )}? This cannot be undone.`
            : ""
        }
        confirmLabel={cancelling ? "Cancelling..." : "Cancel memo"}
        confirmColor="error"
        onConfirm={handleCancel}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((current) => ({ ...current, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() =>
            setSnackbar((current) => ({ ...current, open: false }))
          }
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
