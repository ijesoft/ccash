import { gql } from "@apollo/client";

export const GET_BRANDING = gql`
  query Branding {
    branding {
      logoUrl
      version
      updatedAt
    }
  }
`;

export interface BrandingData {
  branding: {
    logoUrl: string;
    version: number;
    updatedAt: string;
  };
}
