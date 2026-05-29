// packages/shared/types.ts
// Shared TypeScript types used by both frontend and backend

// ─── Enums ────────────────────────────────────────────────────────────────────

export type RegistrationStatus = 'not_approved' | 'approved';
export type OrgStatus          = 'pending' | 'approved' | 'rejected' | 'suspended';
export type MemberRole         = 'admin' | 'co_organizer';
export type MemberStatus       = 'active' | 'inactive';

// ─── Database row types ───────────────────────────────────────────────────────

export interface User {
  id:            string;
  name:          string;
  email:         string;
  password_hash: string;
  created_at:    string;
}

export interface Org {
  id:               string;
  name:             string;
  email:            string;
  status:           OrgStatus;
  rejection_reason: string | null;
  created_at:       string;
}

export interface OrgMember {
  id:         string;
  user_id:    string;
  org_id:     string;
  role:       MemberRole;
  status:     MemberStatus;
  invited_by: string | null;
  created_at: string;
}

export interface SuperAdmin {
  id:            string;
  name:          string;
  email:         string;
  password_hash: string;
  created_at:    string;
}

export interface Event {
  id:             string;
  org_id:         string;
  name:           string;
  description:    string | null;
  date:           string | null;
  location:       string | null;
  slug:           string;
  admin_password: string;
  is_active:      boolean;
  created_at:     string;
}

export interface Registration {
  id:            string;
  event_id:      string;
  user_id:       string;
  email:         string;
  name:          string;
  surname:       string;
  state:         string;
  city:          string;
  mobile:        string;
  profession:    string;
  other_info:    string | null;
  unique_code:   string;
  status:        RegistrationStatus;
  registered_at: string;
}

export interface Checkin {
  id:              string;
  registration_id: string;
  event_id:        string;
  approved_at:     string;
  approved_by:     string;
}

// ─── JWT Payload ──────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub:        string;      // users.id (or super_admins.id for super admin tokens)
  email:      string;
  name:       string;
  // Org member fields — present only if user has an org role
  memberId?:  string;      // org_members.id (absent for event-only members)
  role?:      MemberRole | 'super_admin';
  orgId?:     string;
  orgName?:   string;
  orgStatus?: OrgStatus;
  // Set to true when access is via event_members only (not org_members)
  isEventMember?: boolean;
  iat?:       number;
  exp?:       number;
}

// ─── API Request types ────────────────────────────────────────────────────────

export interface UserSignupRequest {
  name:     string;
  email:    string;
  password: string;
}

export interface OrgSignupRequest {
  orgName:   string;
  adminName: string;
  email:     string;
  password:  string;
}

export interface LoginRequest {
  email:    string;
  password: string;
}

export interface SuperAdminLoginRequest {
  email:    string;
  password: string;
}

export interface InviteMemberRequest {
  name:     string;
  email:    string;
  password: string;
  role:     MemberRole;
}

export interface UpdateOrgStatusRequest {
  status:          OrgStatus;
  rejectionReason?: string;
}

export interface CreateEventRequest {
  name:          string;
  description?:  string;
  date?:         string;
  location?:     string;
  slug:          string;
  adminPassword: string;
}

export interface UpdateEventRequest {
  name?:          string;
  description?:   string;
  date?:          string;
  location?:      string;
  slug?:          string;
  adminPassword?: string;
  isActive?:      boolean;
}

export interface CreateRegistrationRequest {
  email:      string;
  name:       string;
  surname:    string;
  state:      string;
  city:       string;
  mobile:     string;
  profession: string;
  otherInfo?: string;
}

export interface CheckinRequest {
  adminPassword: string;
}

// ─── API Response shapes ──────────────────────────────────────────────────────

/** Returned by POST /auth/signup, POST /auth/signup/org, POST /auth/login, POST /auth/refresh */
export interface AuthResponse {
  token:        string;
  refreshToken: string;
  user: {
    id:        string;
    name:      string;
    email:     string;
    // Org member fields — present if user is an org member
    memberId?:    string;
    role?:        MemberRole;
    orgId?:       string;
    orgName?:     string;
    orgStatus?:   OrgStatus;
    isEventMember?: boolean;
  };
}

export interface SuperAdminAuthResponse {
  token:        string;
  refreshToken: string;
  admin: Pick<SuperAdmin, 'id' | 'name' | 'email'>;
}

export interface EventWithCounts extends Omit<Event, 'admin_password'> {
  registration_count: number;
  checkin_count:      number;
  // Per-request: the calling user's role on this event (null = admin, has full access)
  userEventRole?: 'co_organizer' | 'scanner' | null;
}

/** org_members row joined with user name/email for display */
export interface OrgMemberPublic {
  id:         string;
  user_id:    string;
  name:       string;
  email:      string;
  role:       MemberRole;
  status:     MemberStatus;
  invited_by: string | null;
  created_at: string;
}

export interface OrgWithStats extends Org {
  member_count:      number;
  event_count:       number;
  registration_count: number;
}

export interface CheckinLookupResponse {
  registration: Omit<Registration, 'user_id'>;
  event:        Omit<Event, 'admin_password'>;
}

export interface CheckinApproveResponse {
  ok:              boolean;
  name?:           string;
  alreadyApproved?: boolean;
  approvedAt?:     string;
  error?:          string;
}

export interface AnalyticsResponse {
  total:   number;
  approved: number;
  pending: number;
  recentCheckins: (Checkin & { registration: Pick<Registration, 'name' | 'surname' | 'email'> })[];
}

/** Returned by GET /user/registrations */
export interface UserRegistration {
  id:            string;
  unique_code:   string;
  status:        RegistrationStatus;
  registered_at: string;
  event: {
    id:       string;
    name:     string;
    slug:     string;
    date:     string | null;
    location: string | null;
    is_active: boolean;
  };
}

// ─── API Error shape ──────────────────────────────────────────────────────────

export interface ApiError {
  error:      string;
  statusCode?: number;
}

