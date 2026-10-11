import { ApiError } from "@energyrd/api-client";
import { HomeSchema, InvitationOutSchema, MemberOutSchema } from "@energyrd/api-contracts";
import { z } from "zod";
import { UUID, apiMessage, request } from "./request";

// ERD-SHARE-01: compartir vivienda. Mismo transporte que el onboarding (BFF con cookies HttpOnly); el texto de
// error ya viene en español desde el BFF y nunca es el de la API.
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const path = (homeId: string, suffix: string) => {
  if (!UUID.test(homeId)) throw new Error("Vivienda inválida.");
  return `/api/v1/homes/${homeId}${suffix}`;
};

const none = z.undefined();
export const listMembers = (homeId: string) => request(path(homeId, "/members"), "GET", undefined, MemberOutSchema.array());
export const listInvitations = (homeId: string) => request(path(homeId, "/invitations"), "GET", undefined, InvitationOutSchema.array());
export const createInvitation = (homeId: string, email: string) =>
  request(path(homeId, "/invitations"), "POST", { email: email.trim().toLowerCase() }, InvitationOutSchema);
export const revokeInvitation = (homeId: string, invitationId: string) => {
  if (!UUID.test(invitationId)) throw new Error("Invitación inválida.");
  return request(path(homeId, `/invitations/${invitationId}`), "DELETE", {}, none);
};
export const removeMember = (homeId: string, userId: string) => {
  if (!UUID.test(userId)) throw new Error("Miembro inválido.");
  return request(path(homeId, `/members/${userId}`), "DELETE", {}, none);
};
export const leaveHome = (homeId: string) => request(path(homeId, "/members/me"), "DELETE", {}, none);
export const transferOwnership = (homeId: string, userId: string, password: string) => {
  if (!UUID.test(userId)) throw new Error("Miembro inválido.");
  return request(path(homeId, "/transfer-ownership"), "POST", { user_id: userId, password }, none);
};
export const acceptInvitation = (token: string) => {
  if (!TOKEN.test(token)) throw new ApiError(422, "El enlace de invitación no es válido.");
  return request("/api/v1/invitations/accept", "POST", { token }, HomeSchema);
};

/** Token del fragmento `#token=<43 caracteres base64url>`; cualquier otra forma es inválida. */
export function parseInvitationToken(hash: string): string | null {
  const values = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).getAll("token");
  return values.length === 1 && TOKEN.test(values[0]) ? values[0] : null;
}

export const sharingMessage = apiMessage;
