export interface UserPresencePort {
  existsActiveUser(userId: string): Promise<boolean>;
}

export const USER_PRESENCE_PORT = Symbol('USER_PRESENCE_PORT');
