import { Request } from 'express';

export interface AuthenticatedUser {
  clerkId: string;
  internalUserId: string;
}

export type AuthenticatedRequest = Request & {
  currentUser?: AuthenticatedUser;
};
