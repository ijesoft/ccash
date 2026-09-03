import { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { useQuery } from "@apollo/client";
import { GET_BRANDING, type BrandingData } from "../graphql/queries/branding";

export default function BrandMark({ icon }: { icon: React.ReactNode }) {
  const { data } = useQuery<BrandingData>(GET_BRANDING);
  const logoUrl = data?.branding?.logoUrl || "";
  const [logoError, setLogoError] = useState(false);
  useEffect(() => setLogoError(false), [logoUrl]);

  if (logoUrl && !logoError) {
    return (
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          overflow: "hidden",
          mx: "auto",
          mb: 1.5,
          boxShadow: "0 8px 20px rgba(15,110,205,0.35)",
        }}
      >
        <img
          src={logoUrl}
          key={logoUrl}
          alt="CCash logo"
          onError={() => setLogoError(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: 56,
        height: 56,
        borderRadius: 2.5,
        background: "linear-gradient(135deg, #0f6ecd 0%, #084585 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        mx: "auto",
        mb: 1.5,
        boxShadow: "0 8px 20px rgba(15,110,205,0.35)",
      }}
    >
      {icon}
    </Box>
  );
}
