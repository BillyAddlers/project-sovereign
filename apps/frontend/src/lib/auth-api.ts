import { get, post } from "@/lib/api";
import type { LoginInput, PublicUser, RegisterInput } from "@/lib/schemas";

/**
 * Thin wrappers over the `/api/auth` routes.
 *
 * The session lives in an httpOnly cookie the browser sends automatically
 * (`withCredentials` is set on the shared Axios instance), so nothing here
 * reads or stores a token.
 */
export const authApi = {
  me: () => get<PublicUser>("/auth/me"),
  login: (body: LoginInput) => post<PublicUser, LoginInput>("/auth/login", body),
  register: (body: RegisterInput) => post<PublicUser, RegisterInput>("/auth/register", body),
  logout: () => post<null, Record<string, never>>("/auth/logout", {}),
};
