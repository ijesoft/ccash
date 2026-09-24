import { useEffect, useState } from "react";
import { Box, Typography, Button, Stack, Snackbar, Alert, Chip, TextField, InputAdornment, IconButton, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useMutation, useQuery } from "@apollo/client";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SearchIcon from "@mui/icons-material/Search";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditIcon from "@mui/icons-material/Edit";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BlockIcon from "@mui/icons-material/Block";
import { GET_MASTER_LIST, MASTER_LIST_UPDATE_ENTRY } from "../graphql/queries/masterList";
import MasterListAddDialog from "../components/MasterListAddDialog";
import MasterListEditDialog, { type MasterListRow } from "../components/MasterListEditDialog";
import MasterListImportDialog from "../components/MasterListImportDialog";

export default function MasterList() {
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selected, setSelected] = useState<MasterListRow | null>(null);
  const [editTarget, setEditTarget] = useState<MasterListRow | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPaginationModel((m) => ({ ...m, page: 0 }));
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, loading, refetch } = useQuery(GET_MASTER_LIST, {
    variables: {
      limit: paginationModel.pageSize,
      offset: paginationModel.page * paginationModel.pageSize,
      q: debouncedSearch,
    },
  });
  const [updateEntry] = useMutation(MASTER_LIST_UPDATE_ENTRY, {
    refetchQueries: [{ query: GET_MASTER_LIST }],
  });
  const rows = data?.masterListEntries.items ?? [];
  const total = data?.masterListEntries.total ?? 0;

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, row: MasterListRow) => {
    setAnchorEl(event.currentTarget);
    setSelected(row);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelected(null);
  };

  const handleOpenEdit = () => {
    if (selected) setEditTarget(selected);
    handleMenuClose();
  };

  const handleToggleStatus = async () => {
    if (!selected) return;
    const nextStatus = selected.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await updateEntry({ variables: { entryId: selected.id, input: { status: nextStatus } } });
      setSnackbar({ open: true, message: `Member ${selected.idNo} set to ${nextStatus}`, severity: "success" });
      refetch();
    } catch (err: unknown) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : "Failed to update status", severity: "error" });
    }
    handleMenuClose();
  };

  const columns: GridColDef[] = [
    { field: "idNo", headerName: "9-Digit ID No.", width: 130 },
    { field: "lastName", headerName: "Last Name", flex: 1, minWidth: 140 },
    { field: "firstName", headerName: "First Name", flex: 1, minWidth: 140 },
    { field: "middleName", headerName: "Middle Name", flex: 1, minWidth: 120 },
    { field: "mobileNumber", headerName: "Mobile Number", width: 150 },
    { field: "email", headerName: "Email Address", flex: 1, minWidth: 200 },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={params.value === "ACTIVE" ? "success" : "default"}
          variant={params.value === "ACTIVE" ? "filled" : "outlined"}
        />
      ),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 80,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={(e) => handleMenuOpen(e, params.row as MasterListRow)}
          aria-label="Actions"
        >
          <MoreVertIcon />
        </IconButton>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" rowGap={1}>
        <Typography variant="h5" fontWeight="bold">Master List</Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<PersonAddIcon />} onClick={() => setAddOpen(true)}>
            Add Member
          </Button>
          <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
            Import Excel
          </Button>
        </Stack>
      </Stack>
      <Box mb={2}>
        <TextField
          size="small"
          placeholder="Search ID, name, mobile, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: "100%", sm: 360 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>
      <Box sx={{ height: 500, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          rowCount={total}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[5, 10, 25]}
          disableRowSelectionOnClick
          sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}
        />
      </Box>
      <MasterListAddDialog open={addOpen} onClose={() => { setAddOpen(false); refetch(); }} />
      <MasterListEditDialog
        open={Boolean(editTarget)}
        entry={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(message) => { refetch(); setSnackbar({ open: true, message, severity: "success" }); }}
      />
      <MasterListImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onUploaded={() => { refetch(); setSnackbar({ open: true, message: "Import complete", severity: "success" }); }}
      />
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleOpenEdit}>
          <ListItemIcon>
            <EditIcon fontSize="small" color="primary" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        {selected?.status === "ACTIVE" ? (
          <MenuItem onClick={handleToggleStatus}>
            <ListItemIcon>
              <BlockIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Deactivate</ListItemText>
          </MenuItem>
        ) : (
          <MenuItem onClick={handleToggleStatus}>
            <ListItemIcon>
              <CheckCircleIcon fontSize="small" color="success" />
            </ListItemIcon>
            <ListItemText>Activate</ListItemText>
          </MenuItem>
        )}
      </Menu>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
