import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@apollo/client";
import {
  APPROVE_CREDIT_MEMO,
  DECLINE_CREDIT_MEMO,
} from "../graphql/mutations/creditMemos";
import type { CreditMemo } from "../types";
import { formatMoney } from "../utils/format";

interface Props {
  memo: CreditMemo | null;
  onClose: () => void;
  onChanged: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 150 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={500}>
        {value}
      </Typography>
    </Stack>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CreditMemoReviewDialog({
  memo,
  onClose,
  onChanged,
}: Props) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const idempotencyKey = useRef("");
  const [approve, { loading: approving }] = useMutation(APPROVE_CREDIT_MEMO);
  const [decline, { loading: declining }] = useMutation(DECLINE_CREDIT_MEMO);

  useEffect(() => {
    setNote("");
    setError("");
    idempotencyKey.current = crypto.randomUUID();
  }, [memo?.id]);

  if (!memo) return null;

  const isOpen = memo.status === "FOR_REVIEW";
  const busy = approving || declining;

  const handleApprove = async () => {
    setError("");
    try {
      await approve({
        variables: {
          id: memo.id,
          note: note.trim() || null,
          idempotencyKey: idempotencyKey.current,
        },
      });
      onChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not approve credit memo");
    }
  };

  const handleDecline = async () => {
    if (!note.trim()) {
      setError("A decline reason is required");
      return;
    }
    setError("");
    try {
      await decline({ variables: { id: memo.id, note: note.trim() } });
      onChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not decline credit memo");
    }
  };

  return (
    <Dialog open={!!memo} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Credit Memo {memo.reference}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.25} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Field label="Status" value={memo.status.replaceAll("_", " ")} />
          <Field label="Disputed amount" value={formatMoney(memo.amount.cents)} />
          <Field label="Merchant" value={`${memo.merchant.email}`} />
          <Field
            label="Customer"
            value={
              memo.customer.name
                ? `${memo.customer.name} (${memo.customer.maskedMobile})`
                : memo.customer.email
            }
          />
          <Field
            label="Original transaction"
            value={`${memo.transactionReference ?? memo.transactionId} · ${formatMoney(
              memo.transactionAmount.cents,
            )}`}
          />
          <Divider />
          <Box>
            <Typography variant="caption" color="text.secondary">
              Merchant reason
            </Typography>
            <Typography variant="body2">{memo.reason}</Typography>
          </Box>
          {memo.adminNote && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Admin note
              </Typography>
              <Typography variant="body2">{memo.adminNote}</Typography>
            </Box>
          )}
          {memo.refundTransactionReference && (
            <Field
              label="Refund reference"
              value={memo.refundTransactionReference}
            />
          )}
          {memo.decidedByEmail && (
            <Field label="Decided by" value={memo.decidedByEmail} />
          )}
          {memo.decidedAt && (
            <Field label="Decided at" value={formatDateTime(memo.decidedAt)} />
          )}
          {memo.cancelledAt && (
            <Field
              label="Cancelled at"
              value={formatDateTime(memo.cancelledAt)}
            />
          )}
          {isOpen && (
            <TextField
              label="Admin note (required to decline)"
              multiline
              minRows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {isOpen && (
          <>
            <Button
              color="error"
              variant="outlined"
              onClick={handleDecline}
              disabled={busy}
            >
              {declining ? "Declining..." : "Decline"}
            </Button>
            <Button
              variant="contained"
              onClick={handleApprove}
              disabled={busy}
            >
              {approving ? "Approving..." : "Approve"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
