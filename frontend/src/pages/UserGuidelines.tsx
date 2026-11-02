import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
  InputAdornment,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../rbac";

interface GuidelineItem {
  question: string;
  steps: string[];
  roles?: Role[];
}

interface GuidelineCategory {
  id: string;
  label: string;
  items: GuidelineItem[];
}

const GUIDELINES: GuidelineCategory[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    items: [
      {
        question: "How do I log in to my account?",
        steps: [
          "Open the app and go to the login page.",
          "Enter your registered email address and password.",
          "Verify with one-time password — either the email OTP or, if enrolled, your authenticator app (the authenticator tab is the default).",
          "On your first login you will also be asked to confirm the ID number registered to your account before the session starts.",
        ],
      },
      {
        question: "Where do I see my balance and recent activity?",
        steps: [
          "The Home screen shows your wallet balance and quick actions.",
          "Open Wallet for your wallet details.",
          "Open History for the full list of your transactions.",
        ],
      },
      {
        question: "How do I register as a member?",
        steps: [
          "Open the Register page (link on the login screen).",
          "Enter your 9-digit ID No — details auto-fill from the master list if found.",
          "Provide your name (last/first/middle), email, and 11-digit mobile number.",
          "Set and confirm your password (8+ characters).",
          "Submit — you will be sent to the login page with a pending-approval flag.",
        ],
      },
      {
        question: "How do I register as a merchant?",
        steps: [
          "Open the Merchant Register page (link on the login screen).",
          "Enter your company name, contact person, 11-digit mobile number, address, and TIN.",
          "Optionally add a landline and a Merchant ID No (leave blank to auto-generate).",
          "Provide your email and set/confirm a password (8+ characters).",
          "Submit — you will be sent to the login page with a pending-approval flag.",
        ],
      },
    ],
  },
  {
    id: "payments",
    label: "Payments & Wallet",
    items: [
      {
        question: "How do I send money to another user?",
        steps: [
          "Open the Send page from the sidebar (or bottom bar on mobile).",
          "Choose the recipient from your favorites or pick a user.",
          "Enter the amount in pesos and add an optional note.",
          "Confirm the transfer — you will see the money leave your wallet immediately, and the recipient receives an in-app notification.",
        ],
      },
      {
        question: "How do I pay or receive with a QR code?",
        steps: [
          "Open the QR page.",
          "To receive, show your personal QR code to the payer.",
          "To pay, point your camera at the other user's QR code and enter the amount.",
          "Amounts sent through QR obey the same wallet limits and balance checks as regular transfers.",
        ],
      },
      {
        question: "How do I read my transaction history?",
        steps: [
          "Every row shows whether the money moved in or out for you — the direction always depends on which wallet you are viewing.",
          "The counterparty is listed beside each transaction; another user's mobile number is masked for privacy.",
          "Pending, successful and failed entries are labelled with their status pill.",
        ],
      },
      {
        question: "What does the notification badge mean?",
        steps: [
          "The bell icon in the header and sidebar shows the number of unread notifications.",
          "Financial activity touching your wallet always generates a notification.",
          "Open the Notifications page to review your history of alerts.",
        ],
      },
    ],
  },
  {
    id: "cash-operations",
    label: "Cash In / Cash Out",
    items: [
      {
        question: "What are Cash In and Cash Out?",
        steps: [
          "Cash In credits a user's wallet with physical cash tendered at an agent or admin counter.",
          "Cash Out is the reverse: the user's wallet is debited when they withdraw their balance in cash.",
          "Every operation is idempotent — repeating the same request never charges a user twice.",
        ],
        roles: ["ADMIN", "SUPER_ADMIN"],
      },
      {
        question: "Why don't I see Cash In / Cash Out in my sidebar?",
        steps: [
          "Those pages are only revealed to accounts with the cash operation permission.",
          "Regular members transact through Send, QR and Credit Memos instead.",
        ],
        roles: ["ADMIN", "SUPER_ADMIN"],
      },
    ],
  },
  {
    id: "credit-memos",
    label: "Credit Memos",
    items: [
      {
        question: "How does a merchant submit a credit memo?",
        steps: [
          "Open Credit Memos from the sidebar and choose Submit.",
          "Select your customer, the transaction being corrected, and the refund amount.",
          "Add the reason for the correction — one line is usually enough.",
          "Submit the memo. It enters the FOR_REVIEW queue and is locked while pending; only memos still awaiting review can be cancelled.",
        ],
        roles: ["MERCHANT", "ADMIN", "SUPER_ADMIN"],
      },
      {
        question: "How are credit memos reviewed?",
        steps: [
          "Accounts with review permission see the full memo queue, filterable by status and reference.",
          "Approving a memo creates a refund transaction that credits the customer from the merchant's wallet — the same balance and limit checks apply as any transfer.",
          "Declining requires an admin note recorded on the memo.",
          "Both the merchant and the customer are notified the moment a decision lands.",
        ],
        roles: ["ADMIN", "SUPER_ADMIN"],
      },
    ],
  },
  {
    id: "security",
    label: "Security & Account",
    items: [
      {
        question: "How is my account protected?",
        steps: [
          "Passwords are stored as Argon2id hashes and never leave the server in plain text.",
          "Sessions are short-lived access tokens with refresh in the background.",
          "Sensitive mutation (transfers, cash operations, credit memos) requires an idempotency key so a double-click cannot double-charge.",
        ],
      },
      {
        question: "What if I lose access to my OTP or password?",
        steps: [
          "Account recovery is handled by authorized administrators — contact your admin.",
          "Admins review recovery requests on the Recovery page before a password is reset.",
          "Your email OTP flow always works as the fallback 2FA channel.",
        ],
      },
      {
        question: "Where do I upload my KYC documents?",
        steps: [
          "Open your Profile page.",
          "Upload the requested identification document listed under KYC.",
          "Uploads are reviewed by administrators before your KYC level is raised.",
        ],
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      {
        question: "What can administrators do?",
        steps: [
          "The Admin dashboard lists users with search, and links to a per-account detail view.",
          "The sidebar Total Wallet Balances card keeps the sum of all active wallets on screen.",
          "Admins run Cash In / Cash Out, review credit memos and KYC uploads, and unlock password recovery.",
        ],
        roles: ["ADMIN", "SUPER_ADMIN"],
      },
      {
        question: "What is the Master List?",
        steps: [
          "The Master List page manages the official list of registered merchant/user identities used for verification.",
          "Admins can upload and update entries; uploads are size-capped to protect the service.",
        ],
        roles: ["ADMIN", "SUPER_ADMIN"],
      },
      {
        question: "What does the super admin dashboard show?",
        steps: [
          "Super admins have exclusive pages for platform stats, user management, roles and audit trail.",
          "The Roles page maps each role to its permission scopes and is the single place to inspect access.",
        ],
        roles: ["SUPER_ADMIN"],
      },
      {
        question: "How do auditors use the app?",
        steps: [
          "Auditors get a read-only console: their own Home, a Ledger of transactions and an Audit Log.",
          "Auditors cannot move user money from the console — all financial actions are outside their scope.",
        ],
        roles: ["AUDITOR"],
      },
    ],
  },
];

function guidelineMatches(item: GuidelineItem, category: GuidelineCategory, query: string): boolean {
  if (!query) return true;
  const haystack = [
    category.label,
    item.question,
    ...item.steps,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export default function UserGuidelines() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | false>(false);

  const visibleCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GUIDELINES.map((category) => ({
      ...category,
      items: category.items.filter(
        (item) =>
          (!item.roles || item.roles.includes((user?.role ?? "") as Role)) &&
          guidelineMatches(item, category, q),
      ),
    })).filter((category) => category.items.length > 0 && (!activeCategory || category.id === activeCategory));
  }, [query, activeCategory, user]);

  const totalResults = useMemo(
    () => visibleCategories.reduce((sum, category) => sum + category.items.length, 0),
    [visibleCategories],
  );

  const handleChange = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) =>
    setExpanded(isExpanded ? panel : false);

  const clearFilters = () => {
    setQuery("");
    setActiveCategory(null);
  };

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          p: { xs: 2.5, md: 3.5 },
          mb: 2.5,
          background: "linear-gradient(135deg, rgba(15,110,205,0.10) 0%, rgba(8,69,133,0.04) 100%)",
          backdropFilter: "blur(10px)",
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              background: "linear-gradient(135deg, #0f6ecd 0%, #084585 100%)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MenuBookOutlinedIcon />
          </Box>
          <Typography variant="h5" fontWeight={700} sx={{ fontFamily: '"League Spartan", sans-serif', letterSpacing: "-0.02em" }}>
            User Guidelines
          </Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ maxWidth: 640 }}>
          Learn how to navigate Campe Wallet: step-by-step instructions for payments, credit memos,
          account security and the admin console. Filter by category or search everything below.
        </Typography>
      </Paper>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ mb: 2, alignItems: { xs: "stretch", sm: "center" } }}
      >
        <TextField
          size="small"
          fullWidth
          placeholder="Search guidelines…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ maxWidth: { sm: 320 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75 }}>
          <Chip
            label="All"
            clickable
            color={activeCategory === null ? "primary" : "default"}
            variant={activeCategory === null ? "filled" : "outlined"}
            onClick={() => setActiveCategory(null)}
          />
          {GUIDELINES.map((category) => (
            <Chip
              key={category.id}
              label={category.label}
              clickable
              color={activeCategory === category.id ? "primary" : "default"}
              variant={activeCategory === category.id ? "filled" : "outlined"}
              onClick={() => setActiveCategory(activeCategory === category.id ? null : category.id)}
            />
          ))}
        </Stack>
      </Stack>

      {!totalResults ? (
        <Paper
          variant="outlined"
          sx={{ p: 6, textAlign: "center", borderRadius: 3, bgcolor: "rgba(255,255,255,0.5)" }}
        >
          <SearchOffIcon color="disabled" sx={{ fontSize: 44, mb: 1 }} />
          <Typography fontWeight={600} gutterBottom>
            No guidelines match your search
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Try a different keyword or clear the filters.
          </Typography>
          <Chip label="Clear filters" clickable color="primary" onClick={clearFilters} />
        </Paper>
      ) : (
        <Stack spacing={3}>
          {visibleCategories.map((category) => (
            <Box key={category.id}>
              <Typography
                variant="overline"
                fontWeight={700}
                color="primary"
                sx={{ letterSpacing: "0.08em" }}
              >
                {category.label}
              </Typography>
              <Stack spacing={1.25}>
                {category.items.map((item, index) => {
                  const panel = `${category.id}-${index}`;
                  return (
                    <Accordion
                      key={panel}
                      expanded={expanded === panel}
                      onChange={handleChange(panel)}
                      disableGutters
                      elevation={0}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: "12px !important",
                        bgcolor: "rgba(255,255,255,0.65)",
                        backdropFilter: "blur(8px)",
                        overflow: "hidden",
                        "&:before": { display: "none" },
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        aria-controls={`${panel}-content`}
                        id={`${panel}-header`}
                        sx={{ borderRadius: 2, "&:hover": { bgcolor: "action.hover" } }}
                      >
                        <Typography fontWeight={600}>{item.question}</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Box component="ol" sx={{ m: 0, pl: 3 }}>
                          {item.steps.map((step, stepIndex) => (
                            <Typography
                              key={stepIndex}
                              component="li"
                              color="text.secondary"
                              sx={{ mb: 1, "&::marker": { color: "primary.main", fontWeight: 700 } }}
                            >
                              {step}
                            </Typography>
                          ))}
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
