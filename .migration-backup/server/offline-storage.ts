import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

const OFFLINE_DATA_DIR = path.join(process.cwd(), ".offline-data");
const OFFLINE_ADMIN_ROLES_FILE = path.join(OFFLINE_DATA_DIR, "admin-roles.json");
const OFFLINE_PENDING_SYNC_FILE = path.join(OFFLINE_DATA_DIR, "pending-sync.json");

interface OfflineAdminRole {
  id: number;
  name: string;
  pin: string;
  role: string;
  permissions: string[];
  photoUrl: string | null;
  createdAt: string;
  isOffline: boolean;
}

interface PendingSyncData {
  adminRoles: OfflineAdminRole[];
  lastUpdated: string;
}

function ensureOfflineDataDir(): void {
  if (!fs.existsSync(OFFLINE_DATA_DIR)) {
    fs.mkdirSync(OFFLINE_DATA_DIR, { recursive: true });
  }
}

function loadOfflineAdminRoles(): OfflineAdminRole[] {
  try {
    ensureOfflineDataDir();
    if (fs.existsSync(OFFLINE_ADMIN_ROLES_FILE)) {
      const data = fs.readFileSync(OFFLINE_ADMIN_ROLES_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load offline admin roles:", error);
  }
  return [];
}

function saveOfflineAdminRoles(roles: OfflineAdminRole[]): void {
  try {
    ensureOfflineDataDir();
    fs.writeFileSync(OFFLINE_ADMIN_ROLES_FILE, JSON.stringify(roles, null, 2));
  } catch (error) {
    console.error("Failed to save offline admin roles:", error);
  }
}

function loadPendingSync(): PendingSyncData {
  try {
    ensureOfflineDataDir();
    if (fs.existsSync(OFFLINE_PENDING_SYNC_FILE)) {
      const data = fs.readFileSync(OFFLINE_PENDING_SYNC_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load pending sync data:", error);
  }
  return { adminRoles: [], lastUpdated: new Date().toISOString() };
}

function savePendingSync(data: PendingSyncData): void {
  try {
    ensureOfflineDataDir();
    fs.writeFileSync(OFFLINE_PENDING_SYNC_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Failed to save pending sync data:", error);
  }
}

export const offlineStorage = {
  getAdminRoles(): OfflineAdminRole[] {
    return loadOfflineAdminRoles();
  },

  getAdminRoleByName(name: string): OfflineAdminRole | undefined {
    const roles = loadOfflineAdminRoles();
    return roles.find(r => r.name.toLowerCase() === name.toLowerCase());
  },

  getAdminRole(id: number): OfflineAdminRole | undefined {
    const roles = loadOfflineAdminRoles();
    return roles.find(r => r.id === id);
  },

  async createAdminRole(data: {
    name: string;
    pin: string;
    role: string;
    permissions?: string[];
  }): Promise<OfflineAdminRole> {
    const roles = loadOfflineAdminRoles();
    
    const existingRole = roles.find(r => r.name.toLowerCase() === data.name.toLowerCase());
    if (existingRole) {
      throw new Error("A user with this name already exists");
    }

    const hashedPin = await bcrypt.hash(data.pin, 10);
    const newId = roles.length > 0 ? Math.max(...roles.map(r => r.id)) + 1 : 1;
    
    const newRole: OfflineAdminRole = {
      id: newId,
      name: data.name,
      pin: hashedPin,
      role: data.role,
      permissions: data.permissions || [],
      photoUrl: null,
      createdAt: new Date().toISOString(),
      isOffline: true,
    };

    roles.push(newRole);
    saveOfflineAdminRoles(roles);

    const pending = loadPendingSync();
    pending.adminRoles.push(newRole);
    pending.lastUpdated = new Date().toISOString();
    savePendingSync(pending);

    return newRole;
  },

  async updateAdminRole(id: number, data: Partial<{
    name: string;
    pin: string;
    role: string;
    permissions: string[];
    photoUrl: string | null;
  }>): Promise<OfflineAdminRole> {
    const roles = loadOfflineAdminRoles();
    const index = roles.findIndex(r => r.id === id);
    
    if (index === -1) {
      throw new Error("Admin role not found");
    }

    if (data.pin) {
      data.pin = await bcrypt.hash(data.pin, 10);
    }

    roles[index] = { ...roles[index], ...data };
    saveOfflineAdminRoles(roles);

    return roles[index];
  },

  deleteAdminRole(id: number): void {
    const roles = loadOfflineAdminRoles();
    const filtered = roles.filter(r => r.id !== id);
    saveOfflineAdminRoles(filtered);
  },

  async verifyPin(name: string, pin: string): Promise<{ success: boolean; role?: OfflineAdminRole }> {
    const role = this.getAdminRoleByName(name);
    if (!role) {
      return { success: false };
    }

    const isValid = await bcrypt.compare(pin, role.pin);
    return isValid ? { success: true, role } : { success: false };
  },

  getPendingSync(): PendingSyncData {
    return loadPendingSync();
  },

  clearPendingSync(): void {
    savePendingSync({ adminRoles: [], lastUpdated: new Date().toISOString() });
  },

  hasPendingSync(): boolean {
    const pending = loadPendingSync();
    return pending.adminRoles.length > 0;
  },

  markRoleAsSynced(id: number): void {
    const roles = loadOfflineAdminRoles();
    const index = roles.findIndex(r => r.id === id);
    if (index !== -1) {
      roles[index].isOffline = false;
      saveOfflineAdminRoles(roles);
    }

    const pending = loadPendingSync();
    pending.adminRoles = pending.adminRoles.filter(r => r.id !== id);
    savePendingSync(pending);
  },

  importFromDatabase(dbRoles: any[]): void {
    const existingOfflineRoles = loadOfflineAdminRoles().filter(r => r.isOffline);
    
    const mergedRoles: OfflineAdminRole[] = dbRoles.map(r => ({
      id: r.id,
      name: r.name,
      pin: r.pin || "",
      role: r.role,
      permissions: r.permissions || [],
      photoUrl: r.photoUrl || null,
      createdAt: r.createdAt || new Date().toISOString(),
      isOffline: false,
    }));

    for (const offlineRole of existingOfflineRoles) {
      const exists = mergedRoles.some(r => r.name.toLowerCase() === offlineRole.name.toLowerCase());
      if (!exists) {
        mergedRoles.push(offlineRole);
      }
    }

    saveOfflineAdminRoles(mergedRoles);
  }
};

export function isOfflineDataDir(): boolean {
  return fs.existsSync(OFFLINE_DATA_DIR);
}
