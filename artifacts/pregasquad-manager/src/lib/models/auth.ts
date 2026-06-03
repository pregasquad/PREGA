export interface User {
  id: string | number;
  username?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  profileImageUrl?: string;
  role?: string;
  claims?: Record<string, unknown>;
}
