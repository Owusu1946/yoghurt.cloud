"use server";

import { parseStringify } from "@/lib/utils";
import { avatarPlaceholderUrl } from "@/constants";
import { redirect } from "next/navigation";
import {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionUserId,
} from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createUser,
  findUserByEmail,
  findUserById,
} from "@/lib/mongo/users";

const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
};

export const createAccount = async ({
  fullName,
  email,
  password,
}: {
  fullName: string;
  email: string;
  password: string;
}) => {
  try {
    console.log("auth.createAccount.start", { email });
    const totalStart = performance.now();
    const findStart = performance.now();
    const existing = await findUserByEmail(email);
    const findDur = performance.now() - findStart;
    console.log("auth.createAccount.findUserByEmail", `${Math.round(findDur)}ms`);
    if (existing) throw new Error("Email already in use");

    const hashStart = performance.now();
    const passwordHash = hashPassword(password);
    const hashDur = performance.now() - hashStart;
    console.log("auth.createAccount.hashPassword", `${Math.round(hashDur)}ms`);

    const createStart = performance.now();
    const id = await createUser({
      fullName,
      email,
      avatar: avatarPlaceholderUrl,
      passwordHash,
    });
    const createDur = performance.now() - createStart;
    console.log("auth.createAccount.createUser", `${Math.round(createDur)}ms`);

    const sessionStart = performance.now();
    const token = await createSessionToken({ sub: id });
    await setSessionCookie(token);
    const sessionDur = performance.now() - sessionStart;
    console.log("auth.createAccount.createSession", `${Math.round(sessionDur)}ms`);

    const totalDur = performance.now() - totalStart;
    console.log("auth.createAccount.total", `${(totalDur / 1000).toFixed(3)}s`);
    console.log("auth.createAccount.success", { userId: id, email });

    return parseStringify({ userId: id });
  } catch (error) {
    handleError(error, "Failed to create account");
  }
};

export const signInUser = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  try {
    console.log("auth.signIn.start", { email });
    const totalStart = performance.now();
    const findStart = performance.now();
    const user = await findUserByEmail(email);
    const findDur = performance.now() - findStart;
    console.log("auth.signIn.findUserByEmail", `${Math.round(findDur)}ms`);
    if (!user) return parseStringify({ error: "Invalid credentials" });

    const verifyStart = performance.now();
    const valid = verifyPassword(password, user.passwordHash);
    const verifyDur = performance.now() - verifyStart;
    console.log("auth.signIn.verifyPassword", `${Math.round(verifyDur)}ms`);
    if (!valid) return parseStringify({ error: "Invalid credentials" });

    const sessionStart = performance.now();
    const token = await createSessionToken({ sub: user._id!.toString() });
    await setSessionCookie(token);
    const sessionDur = performance.now() - sessionStart;
    console.log("auth.signIn.createSession", `${Math.round(sessionDur)}ms`);

    const totalDur = performance.now() - totalStart;
    console.log("auth.signIn.total", `${(totalDur / 1000).toFixed(3)}s`);
    console.log("auth.signIn.success", { userId: user._id!.toString(), email });

    return parseStringify({ userId: user._id!.toString() });
  } catch (error) {
    handleError(error, "Failed to sign in user");
  }
};

export const getCurrentUser = async () => {
  try {
    const totalStart = performance.now();
    const userId = await getSessionUserId();
    if (!userId) return null;

    const findStart = performance.now();
    const user = await findUserById(userId);
    const findDur = performance.now() - findStart;
    console.log("auth.getCurrentUser.findUserById", `${Math.round(findDur)}ms`);
    if (!user) return null;

    const mapped = {
      $id: user._id!.toString(),
      accountId: user._id!.toString(),
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatar,
    };
    const result = parseStringify(mapped);
    const totalDur = performance.now() - totalStart;
    console.log("auth.getCurrentUser.total", `${Math.round(totalDur)}ms`);
    return result;
  } catch (error) {
    console.log(error);
  }
};

export const signOutUser = async () => {
  try {
    const start = performance.now();
    await clearSessionCookie();
    const dur = performance.now() - start;
    console.log("auth.signOut.total", `${Math.round(dur)}ms`);
    console.log("auth.signOut.success");
  } catch (error) {
    handleError(error, "Failed to sign out user");
  } finally {
    redirect("/sign-in");
  }
};
