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
  hasJoined: boolean;
  court: {
    id: string;
    name: string;
    city: string;
    district: string | null;
    address: string | null;
  } | null;
  host: {
    id: string;
    email: string;
    nickname: string;
  };
  participants: MatchParticipant[];
};

export type MatchParticipant = {
  id: string;
  email: string;
  nickname: string;
  ntrpLevel: number | null;
  role: string | null;
  status: string | null;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type MatchesResponse = {
  matches?: MatchSummary[];
  pagination?: PaginationMeta;
  message?: string;
  error?: string;
};

export type ProfileUser = {
  id: string;
  email: string | null;
  nickname: string | null;
  ntrp_level: number | null;
  preferred_court_id: string | null;
  created_at: string | null;
};

export type ProfileResponse = {
  user?: ProfileUser;
  createdMatches?: MatchSummary[];
  joinedMatches?: MatchSummary[];
  pagination?: {
    created: PaginationMeta;
    joined: PaginationMeta;
  };
  message?: string;
  error?: string;
};
