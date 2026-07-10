export type AuthMode = "login" | "register";

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  ntrpLevel?: number;
};

export type ApiResponse = {
  message?: string;
  error?: string;
  user?: {
    id: string;
    email?: string;
    profile?: {
      nickname?: string | null;
      ntrp_level?: number | null;
    } | null;
  };
};

export type Court = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  address: string | null;
  surface: string | null;
};

export type CourtsResponse = {
  courts?: Court[];
  message?: string;
  error?: string;
};

export type MatchResponse = {
  message?: string;
  error?: string;
};

export type MatchSummary = {
  id: string;
  playTime: string;
  requiredPlayers: number;
  joinedPlayers: number;
  feePerPerson: number;
  note: string | null;
  status: string;
  court: {
    id: string;
    name: string;
    city: string;
    district: string | null;
  } | null;
  host: {
    id: string;
    email: string;
    nickname: string;
  };
};

export type MatchesResponse = {
  matches?: MatchSummary[];
  message?: string;
  error?: string;
};
