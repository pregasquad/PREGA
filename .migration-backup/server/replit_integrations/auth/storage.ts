import { type User, type UpsertUser } from "@shared/models/auth";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const s = schema();
    const [user] = await db().select().from(s.users).where(eq(s.users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const s = schema();
    const existingUser = await this.getUser(userData.id);
    
    if (existingUser) {
      await db()
        .update(s.users)
        .set({
          ...userData,
          updatedAt: new Date(),
        })
        .where(eq(s.users.id, userData.id));
    } else {
      await db().insert(s.users).values(userData);
    }
    
    const [user] = await db().select().from(s.users).where(eq(s.users.id, userData.id));
    return user;
  }
}

export const authStorage = new AuthStorage();
