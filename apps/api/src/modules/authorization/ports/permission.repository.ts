export interface PermissionRepository {
  hasUserPermission(userId: string, permissionCode: string): Promise<boolean>;
  listUserPermissionCodes(userId: string): Promise<string[]>;
}
