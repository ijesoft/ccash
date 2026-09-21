import { useState } from "react";
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Snackbar, Alert } from "@mui/material";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TableChartIcon from "@mui/icons-material/TableChart";
import { downloadReport } from "../utils/reportDownload";

interface Props {
  accountId: string;
  accountLabel: string;
}

/** Per-account "for reconciliation" export, used from the Members and Merchants admin tables. */
export default function AccountExportMenu({ accountId, accountLabel }: Props) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [error, setError] = useState("");

  const handleExport = async (kind: "pdf" | "xlsx") => {
    setAnchorEl(null);
    try {
      await downloadReport(
        `/api/admin/reports/transactions/${accountId}.${kind}`,
        `campe-wallet-transactions-${accountLabel}.${kind}`
      );
    } catch (err: any) {
      setError(err.message || "Export failed");
    }
  };

  return (
    <>
      <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)} aria-label="Export transaction history">
        <FileDownloadIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => handleExport("pdf")}>
          <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Export PDF</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleExport("xlsx")}>
          <ListItemIcon><TableChartIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Export Excel</ListItemText>
        </MenuItem>
      </Menu>
      <Snackbar open={!!error} autoHideDuration={4000} onClose={() => setError("")} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity="error" variant="filled" onClose={() => setError("")}>{error}</Alert>
      </Snackbar>
    </>
  );
}
