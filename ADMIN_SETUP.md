# Admin Section Implementation Guide

## Overview
Se ha implementado una sección Admin completa para CRS LAB con gestión de usuarios administrativos. El módulo está completamente funcional pero requiere una configuración inicial.

## Architecture

### Components Created
1. **Admin Sidebar** (`components/admin/admin-sidebar.tsx`) - Navegación del panel admin
2. **Users Table** (`components/admin/users-table.tsx`) - Tabla interactive de usuarios con búsqueda, filtrado y ordenamiento
3. **User Edit Form** (`components/admin/user-edit-form.tsx`) - Formulario para editar detalles del usuario

### Pages Created
1. `/admin` - Redirige a `/admin/users`
2. `/admin/users` - Lista de usuarios
3. `/admin/users/[id]` - Detalle y edición de usuario

### Services & Actions
1. **Repository**: `lib/repositories/admin-user.repository.ts` - Queries Prisma para admin
2. **Actions**: `app/actions/admin-user.actions.ts` - Server actions para operaciones admin
3. **Auth Guard**: `lib/auth/admin.ts` - Helpers para verificar acceso admin

### Layout Integration
- **AppSidebar**: Modificado para mostrar icono Admin (ShieldCheck) para usuarios admin
- **App Layout**: Modificado para pasar estado admin al sidebar
- **AppSectionShell**: Reutiliza el patrón existente

## IMPORTANT: Admin Access Configuration

### Current Implementation (Temporary)
Por ahora, el sistema determina admin status verificando si el usuario tiene un `company_id` asignado:

```typescript
// lib/auth/admin.ts
const isAdmin = user?.company_id !== null && user?.company_id !== undefined;
```

### Recommended: Add is_admin Field
Para un sistema más robusto, se recomienda agregar un campo `is_admin` a la tabla `users`:

#### Option 1: Using Prisma Migration (Recommended)

```bash
# 1. Create migration
npx prisma migrate dev --name add_is_admin_to_users

# 2. Add this to the migration file (schema.prisma):
# In the users model, add:
# is_admin Boolean @default(false)
```

Then update `lib/auth/admin.ts`:
```typescript
const user = await prisma.users.findUnique({
  where: { id: userId },
  select: { is_admin: true }
});
return user?.is_admin ?? false;
```

#### Option 2: SQL Migration (Manual)
```sql
ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
```

#### Option 3: Using company_id (Current - Temporary)
Continue using the company_id check, but mark specific users as company owners.

## User Metrics Available

### ✅ Implemented & Available
- **Nombre**: Stored in `users.name`
- **Email**: Stored in `users.email`
- **Rol**: Not in users table (workspace-specific)
- **Tipo de Cuenta**: Not in schema (can be added via metadata)
- **Fecha de alta**: `users.created_at`
- **Último login**: `users.last_login_at`
- **Workspaces**: Joined through `workspace_members`
- **Archivos subidos**: Count from `knowledge_files`
- **Almacenamiento**: Sum of `knowledge_files.size`
- **Conversaciones**: Count from `chat_conversations`
- **Estado**: Stored in `users.status` (active/inactive/suspended)
- **XP & Level**: Stored in `users.xp` and `users.level`
- **Email Verificado**: `users.email_verified_at`

### ❌ Not Currently Available (Can be added)
- **Account Type**: Would require adding a field to users model
- **Specific role field**: Currently roles are workspace-scoped

## Users Table Features

### Search & Filters
- ✅ Search by name or email
- ✅ Filter by status (active/inactive/suspended)
- ✅ Sort by: name, creation date, last login

### User Actions
- ✅ View user details
- ✅ Edit name and status
- ✅ View workspace memberships
- ✅ See storage usage
- ✅ See conversation count

### Editable Fields
- `name` - User display name
- `status` - Account status (active/inactive/suspended)

### Protected Fields (Not Editable)
- `email` - Use email system for changes
- `password_hash` - Use password reset flow
- `email_verified_at` - Use email verification
- `IDs` - System generated
- `Metrics` (storage, file count, etc.) - Calculated

## Setting Up Admin Users

### Method 1: Direct Database Update
```sql
-- Make user with ID = 'user-uuid' an admin
UPDATE users SET is_admin = true WHERE id = 'user-uuid';
-- OR using company_id (temporary):
UPDATE users SET company_id = 'company-uuid' WHERE id = 'user-uuid';
```

### Method 2: Using Prisma Studio
```bash
npx prisma studio
# Navigate to users table
# Find your user and set is_admin = true
```

### Method 3: Via Next.js API (Create admin endpoint)
```typescript
// app/api/admin/setup/route.ts
export async function POST(req: Request) {
  const { userId } = await req.json();
  await prisma.users.update({
    where: { id: userId },
    data: { is_admin: true }
  });
  return Response.json({ ok: true });
}
```

## Authorization Flow

```
Request to /admin/* 
    ↓
AppLayout checks auth() & passes isAdmin to AppSidebar
    ↓
Admin link only shows if isAdmin = true
    ↓
Admin layout calls requireAdmin(userId)
    ↓
If not admin, redirects to /dashboard
    ↓
Each server action checks requireAdmin() before executing
```

## Testing

### 1. Make yourself admin
```bash
# Using Prisma Studio:
npx prisma studio
# Find your user, set is_admin = true (or company_id if using that)
```

### 2. Verify admin access
- Logout and login
- Check if Admin icon appears in sidebar
- Click Admin → should go to users list
- Verify other admin pages redirect or show "Próximamente"

### 3. Test user editing
- Go to `/admin/users`
- Search for a user
- Click "Ver" to open detail
- Edit name or status
- Save changes

### 4. Verify authorization
- Open browser dev tools
- Manually navigate to `/admin` as non-admin user
- Should redirect to `/dashboard`

## Database Schema Notes

Current `users` model includes:
```prisma
model users {
  id                    String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email                 String  @unique
  name                  String?
  image                 String?
  provider              String?
  xp                    Int     @default(0)
  level                 Int     @default(1)
  status                String  @default("active")  # active/inactive/suspended
  password_hash         String?
  email_verified_at     DateTime?
  last_login_at         DateTime?
  company_id            String? @db.Uuid
  created_at            DateTime @default(now())
  updated_at            DateTime @default(now())
  
  # Relations to workspace_members, knowledge_files, chat_conversations, etc.
}
```

## Future Enhancements

### Phase 2: Additional Admin Sections
- ✅ Sidebar structure ready for:
  - Almacenamiento (Storage overview)
  - Uso de IA (AI usage metrics)
  - Actividad (System activity log)
  - Errores (Error tracking)
  - Sistema (System status)

### Potential Additions
1. **Bulk Actions**: Select multiple users and change status
2. **User Roles**: Add role assignments (teacher/admin/staff)
3. **Audit Log**: Track admin changes
4. **Export**: Export user data as CSV
5. **Email Templates**: Send notifications to users from admin panel
6. **Storage Quotas**: Set per-user storage limits
7. **Advanced Filters**: Filter by workspace, provider, level
8. **Pagination**: For systems with many users

## Files Modified

### Created (19 files)
- `lib/auth/admin.ts` - Admin authorization helper
- `components/admin/admin-sidebar.tsx` - Admin sidebar
- `components/admin/users-table.tsx` - Users table component
- `components/admin/user-edit-form.tsx` - User edit form
- `lib/repositories/admin-user.repository.ts` - User data access
- `app/actions/admin-user.actions.ts` - Admin server actions
- `app/(app)/admin/layout.tsx` - Admin section layout
- `app/(app)/admin/page.tsx` - Admin index (redirect)
- `app/(app)/admin/users/page.tsx` - Users list page
- `app/(app)/admin/users/[id]/page.tsx` - User detail page

### Modified (2 files)
- `components/app/sidebar.tsx` - Added Admin menu item + ShieldCheck icon
- `app/(app)/layout.tsx` - Added isUserAdmin check & pass to sidebar

## Environment & Dependencies

### No new dependencies added
All components use existing UI library:
- `Button`, `Input`, `Label`, `Select` from `@/components/ui`
- Icons from `lucide-react` (ShieldCheck already imported)
- `date-fns` for date formatting (already in project)

### Prisma
Uses existing Prisma client, no new models required (but is_admin field recommended)

## Common Issues & Solutions

### Issue: Admin menu doesn't appear
**Solution**: Make sure user has `is_admin = true` or `company_id` set. Check via Prisma Studio.

### Issue: "Unauthorized: Admin access required" error
**Solution**: User isn't marked as admin. Update database as shown in "Setting Up Admin Users" section.

### Issue: Can't edit user email
**Solution**: Email is protected field by design. Only name and status can be edited via admin panel.

### Issue: File count shows 0 but should be higher
**Solution**: Might need to check `knowledge_files` table - ensure files are properly recorded.

## Next Steps

1. **Add is_admin field** to users model (recommended)
2. **Make first admin user** using one of the methods above
3. **Test the admin section** following the testing guide
4. **Implement other admin pages** using the sidebar structure as template
5. **Add audit logging** for admin changes (optional)
6. **Set up email notifications** for admin alerts (optional)

## Support

For issues or questions:
- Check Prisma schema in `prisma/schema.prisma`
- Review auth flow in `auth.ts`
- Check server action patterns in `app/actions/`
- Refer to existing pages like Dashboard for UI patterns
