import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "app_session";

const getSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
};

export const createSessionToken = async (payload: { sub: string }) => {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
  return token;
};

export const setSessionCookie = async (token: string) => {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
};

export const clearSessionCookie = async () => {
  (await cookies()).delete(COOKIE_NAME);
};

export const getSessionUserId = async (): Promise<string | null> => {
  const cookie = (await cookies()).get(COOKIE_NAME);
  if (!cookie?.value) return null;
  try {
    const { payload } = await jwtVerify(cookie.value, getSecret());
    const sub = payload.sub as string | undefined;
    return sub || null;
  } catch {
    return null;
  }
};
