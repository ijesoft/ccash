import { useEffect, useState } from "react";
import { Box, Typography, Button, Stack, Snackbar, Alert, Chip, TextField, InputAdornment } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery } from "@apollo/client";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SearchIcon from "@mui/icons-material/Search";
import { GET_MASTER_LIST } from "../graphql/queries/masterList";
import MasterListAddDialog from "../components/MasterListAddDialog";
import MasterListImportDialog from "../components/MasterListImportDialog";

export default function MasterList() {
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "" });

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
  const rows = data?.masterListEntries.items ?? [];
  const total = data?.masterListEntries.total ?? 0;

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
      <MasterListImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onUploaded={() => { refetch(); setSnackbar({ open: true, message: "Import complete" }); }}
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ open: false, message: "" })}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
