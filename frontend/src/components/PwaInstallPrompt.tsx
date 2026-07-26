import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import AddToHomeScreenIcon from "@mui/icons-material/AddToHomeScreen";
import CloseIcon from "@mui/icons-material/Close";
import IosShareIcon from "@mui/icons-material/IosShare";
import MoreVertIcon from "@mui/icons-material/MoreVert";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISSED_KEY = "ccash-pwa-prompt-dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);

  const isIos = useMemo(
    () => /iphone|ipad|ipod/i.test(window.navigator.userAgent),
    [],
  );
  const isAndroid = useMemo(
    () => /android/i.test(window.navigator.userAgent),
    [],
  );

  useEffect(() => {
    if (installed || sessionStorage.getItem(DISMISSED_KEY)) return;

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      window.setTimeout(() => setVisible(true), 1200);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    let fallbackTimer: number | undefined;
    if (window.isSecureContext && !isStandalone()) {
      fallbackTimer = window.setTimeout(() => setVisible(true), isIos ? 1600 : 2800);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, [installed, isIos]);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      setVisible(false);
      if (choice.outcome === "dismissed") {
        sessionStorage.setItem(DISMISSED_KEY, "1");
      }
      return;
    }

    setInstructionsOpen(true);
  };

  if (installed || !visible) return null;

  return (
    <>
      <Paper
        role="region"
        aria-label="Install CCash"
        elevation={12}
        className="animate-slide-up"
        sx={{
          position: "fixed",
          zIndex: 1500,
          left: { xs: 12, sm: "auto" },
          right: { xs: 12, sm: 24 },
          bottom: {
            xs: "calc(76px + var(--safe-bottom))",
            md: 24,
          },
          width: { xs: "auto", sm: 390 },
          p: 2,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "0 18px 45px rgba(8,69,133,0.22)",
        }}
      >
        <IconButton
          size="small"
          onClick={dismiss}
          aria-label="Dismiss install invitation"
          sx={{ position: "absolute", top: 8, right: 8 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <Box sx={{ display: "flex", gap: 1.5, pr: 3 }}>
          <Box
            component="img"
            src="/icons/icon-192.png"
            alt=""
            sx={{ width: 52, height: 52, borderRadius: 2, flexShrink: 0 }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Install CCash
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Add CCash to your home screen for faster, app-like access.
            </Typography>
          </Box>
        </Box>

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button fullWidth variant="outlined" onClick={dismiss}>
            Not now
          </Button>
          <Button
            fullWidth
            variant="contained"
            startIcon={<AddToHomeScreenIcon />}
            onClick={install}
          >
            Install
          </Button>
        </Stack>
      </Paper>

      <Dialog
        open={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3, m: 2 } } }}
      >
        <DialogTitle sx={{ pr: 6 }}>
          Install CCash
          <IconButton
            onClick={() => setInstructionsOpen(false)}
            aria-label="Close instructions"
            sx={{ position: "absolute", right: 10, top: 10 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {isIos ? (
            <Stack spacing={2}>
              <Instruction
                icon={<IosShareIcon color="primary" />}
                number="1"
                text="Tap the Share button in Safari."
              />
              <Instruction
                icon={<AddToHomeScreenIcon color="primary" />}
                number="2"
                text='Scroll down and tap “Add to Home Screen”.'
              />
              <Instruction
                icon={<AddToHomeScreenIcon color="success" />}
                number="3"
                text='Tap “Add” to finish installing CCash.'
              />
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Instruction
                icon={<MoreVertIcon color="primary" />}
                number="1"
                text={`Open your ${isAndroid ? "browser" : "Chrome or Edge"} menu.`}
              />
              <Instruction
                icon={<AddToHomeScreenIcon color="primary" />}
                number="2"
                text='Choose “Install app” or “Add to Home screen”.'
              />
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Instruction({
  icon,
  number,
  text,
}: {
  icon: React.ReactNode;
  number: string;
  text: string;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          bgcolor: "primary.light",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Typography variant="body2">
        <strong>{number}.</strong> {text}
      </Typography>
    </Box>
  );
}
