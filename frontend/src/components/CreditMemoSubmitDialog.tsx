import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@apollo/client";
import { CREDIT_MEMO_TAGGABLE_TRANSACTIONS } from "../graphql/queries/creditMemos";
import { SUBMIT_CREDIT_MEMO } from "../graphql/mutations/creditMemos";
import type { TaggableTransaction } from "../types";
import { amountToCents, formatMoney } from "../utils/format";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function CreditMemoSubmitDialog({
  open,
  onClose,
  onSubmitted,
}: Props) {
  const [reference, setReference] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<TaggableTransaction | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const idempotencyKey = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(reference.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [reference]);

  useEffect(() => {
    if (!open) return;
    setReference("");
    setDebounced("");
    setSelected(null);
    setAmount("");
    setReason("");
    setError("");
    idempotencyKey.current = crypto.randomUUID();
  }, [open]);

  const { data, loading } = useQuery(CREDIT_MEMO_TAGGABLE_TRANSACTIONS, {
    variables: { reference: debounced, limit: 10 },
    skip: debounced.length < 2,
    fetchPolicy: "cache-and-network",
  });
  const [submit, { loading: submitting }] = useMutation(SUBMIT_CREDIT_MEMO);

  const options = useMemo(
    () => (data?.creditMemoTaggableTransactions ?? []) as TaggableTransaction[],
    [data],
  );

  const amountCents = amountToCents(Number(amount));
  const remaining = selected?.remainingCreditableCents ?? 0;
  const amountValid =
    Number.isFinite(amountCents) && amountCents > 0 && amountCents <= remaining;
  const canSubmit = !!selected && amountValid && reason.trim().length > 0;

  const handleSelect = (value: TaggableTransaction | null) => {
    setSelected(value);
    setAmount(value ? String(value.remainingCreditableCents / 100) : "");
  };

  const handleSubmit = async () => {
    if (!selected || !canSubmit) return;
    setError("");
    try {
      await submit({
        variables: {
          input: {
            transactionId: selected.id,
            amountCents,
            reason: reason.trim(),
            idempotencyKey: idempotencyKey.current,
          },
        },
      });
      onSubmitted();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not submit credit memo");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Credit Memo</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Autocomplete
            options={options}
            value={selected}
            onChange={(_event, value) => handleSelect(value)}
            inputValue={reference}
            onInputChange={(_event, value) => setReference(value)}
            getOptionLabel={(option) => option.reference ?? option.id}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            loading={loading}
            noOptionsText={
              debounced.length < 2
                ? "Type at least 2 characters of the reference"
                : "No matching received transactions"
            }
            renderOption={(props, option) => (
              <Box component="li" {...props} key={option.id}>
                <Stack>
                  <Typography variant="body2" fontWeight={600}>
                    {option.reference}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatMoney(option.amount.cents)} ·{" "}
                    {option.customerName ?? option.customerMaskedMobile} ·{" "}
                    remaining {formatMoney(option.remainingCreditableCents)}
                  </Typography>
                </Stack>
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Transaction reference"
                placeholder="e.g. CC261029..."
                helperText="Search a payment the customer made to you"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loading && <CircularProgress size={16} />}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />

          {selected && (
            <Typography variant="caption" color="text.secondary">
              Transaction amount {formatMoney(selected.amount.cents)}; already
              credited {formatMoney(selected.alreadyCreditedCents)}; remaining{" "}
              {formatMoney(selected.remainingCreditableCents)}
            </Typography>
          )}

          <TextField
            label="Disputed amount (PHP)"
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputProps={{ min: 0.01, step: "0.01" }}
            helperText={
              selected
                ? `Maximum ${formatMoney(selected.remainingCreditableCents)}`
                : "Select a transaction first"
            }
            error={!!amount && !amountValid}
          />

          <TextField
            label="Reason / notes"
            multiline
            minRows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? "Submitting..." : "Submit"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
