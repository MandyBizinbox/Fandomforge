import { setAuthToken } from "./authToken";

export function establishAuthSession(session, setUser) {
  const token = session?.access_token;
  const user = session?.user;

  if (!token || !user) {
    throw new Error("Authentication session response is incomplete.");
  }

  setAuthToken(token);
  if (typeof setUser === "function") setUser(user);
  return user;
}
