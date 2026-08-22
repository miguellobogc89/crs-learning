# Admin Storage Section - Schema & Architecture

## Overview

The Storage admin section (`/admin/storage`) provides visibility into file storage usage across Knowledge bases, including metrics, file inventory, and processing status tracking.

## Data Model

### Core Relationship Chain
```
knowledge_files → knowledge_sources → knowledge_libraries → workspaces
                                                         → organizations
users ←─── knowledge_files (uploaded_by_user_id)
        ←─── knowledge_libraries (owner_user_id)
```

### Key Models

#### knowledge_files
- Primary table for uploaded files
- **Required fields:**
  - `id` (UUID)
  - `file_name` (String) - searchable
  - `knowledge_source_id` (UUID FK)
  - `uploaded_by_user_id` (UUID FK, nullable)
  - `status` (String: "uploaded", "processing", "completed", "failed")
  - `created_at`, `updated_at` (Timestamptz)
- **Optional fields:**
  - `file_size` (Int, bytes) - **Can be NULL**
  - `file_type` (String, MIME type)
  - `storage_path` (String)
  - `extracted_text` (String)

#### knowledge_sources
- Represents the content/article being stored
- Links files to libraries
- **Key fields:**
  - `id`, `title`, `status`
  - `library_id` (UUID FK) → knowledge_libraries
  - `owner_user_id` (UUID) → users
  - `created_by_user_id`, `updated_by_user_id`

#### knowledge_libraries
- Represents the Knowledge Base/Library
- Belongs to workspace and owner
- **Key fields:**
  - `id`, `name`
  - `workspace_id` (UUID FK, nullable)
  - `owner_user_id` (UUID FK)
  - `parent_id` (hierarchical)
  - `visibility` (String: "restricted", "private", etc)

#### knowledge_file_analysis (1-to-1 with files)
- Processing/analysis metadata
- **Key fields:**
  - `knowledge_file_id` (UUID FK, UNIQUE)
  - `status` (String: "pending", "processing", "completed", "failed")
  - `error_message` (String, nullable)
  - `tokens_input`, `tokens_output` (Int, nullable)
  - `model`, `extractor` (String)
  - `processing_ms` (Int)
  - `created_at`, `updated_at`

#### workspaces
- Organization context for libraries
- **Key fields:**
  - `id`, `name`, `slug`
  - `owner_user_id`, `organization_id`
  - `status` (String: "active", etc)

#### users
- Uploaded by user info
- **Key fields:**
  - `id`, `email`, `name`

## Metrics Calculated

### Summary Stats (from `getStorageStats`)
1. **Total Storage** - SUM(file_size) for all files
2. **Total Files** - COUNT(knowledge_files)
3. **Average File Size** - Total bytes / Total files
4. **Top User by Storage** - User with largest aggregate file_size
5. **Top Workspace by Storage** - Workspace with largest aggregate file_size

**Note:** Metrics are NULL-safe; files with `file_size = NULL` treated as 0 bytes.

## Filtering & Search

### Available Filters
| Filter | Source | Type |
|--------|--------|------|
| **Search (file name)** | `knowledge_files.file_name` | Text (case-insensitive) |
| **Uploader** | `users.id` via `knowledge_files.uploaded_by_user_id` | Dropdown |
| **Workspace** | `workspaces.id` via `knowledge_libraries.workspace_id` | Dropdown |
| **File Type** | `knowledge_files.file_type` (MIME) | Dropdown |
| **Status** | `knowledge_files.status` | Dropdown |

### Sorting
| Field | Database Column | Order |
|-------|-----------------|-------|
| File Name | `file_name` | ASC/DESC |
| Size | `file_size` | ASC/DESC |
| Upload Date | `created_at` | ASC/DESC |

## Display Columns

| Column | Data Source | Notes |
|--------|-------------|-------|
| Archivo | `knowledge_files.file_name` | Truncated with title on hover |
| Tamaño | `knowledge_files.file_size` | Formatted as B/KB/MB/GB |
| Tipo | `knowledge_files.file_type` | MIME type, code style |
| Subido por | `users.name / email` | Two-line display |
| Workspace | `knowledge_libraries.workspaces.name` | Can be NULL |
| Biblioteca | `knowledge_libraries.name` | Truncated |
| Knowledge Source | `knowledge_sources.title` | Truncated |
| Estado | `knowledge_files.status` | Colored badge |
| Fecha | `knowledge_files.created_at` | Formatted as "D MMM YYYY HH:MM" |

## File Detail Modal

Shows comprehensive information organized in sections:

### Archivo Section
- Nombre (file_name)
- Tamaño (file_size in bytes and GB)
- Tipo MIME (file_type)
- Subido por (user name + email)
- Fecha (ISO format with time)

### Ubicación Section
- Workspace (can be NULL)
- Biblioteca (library name)
- Knowledge Source (title + status)

### Procesamiento Section
- Estado del archivo (knowledge_files.status)
- Estado de análisis (knowledge_file_analysis.status)
- Tokens procesados (input + output)
- Último error (if exists)

## Missing Data Fields (Schema Gaps)

The following requested features **cannot currently be implemented** without schema changes:

| Feature | Reason | Solution |
|---------|--------|----------|
| Chunk Count | No model tracks chunks | Add `chunks_count` INT to `knowledge_file_analysis` |
| Embeddings Count | No embeddings model exists | Add `embeddings_count` INT to `knowledge_file_analysis` |
| Download URL | No URL generation tracked | Add `download_token` STRING, implement signed URL service |
| File Hash | Not calculated/stored | Add `file_hash` STRING (SHA-256) to `knowledge_files` |
| Retry History | Only last error stored | Add `retry_count` INT, `last_retry_at` TIMESTAMPTZ |
| Storage Quota | No quota system | Add `quota_bytes` BIGINT to workspaces |

## Authorization

- All operations protected by `requireAdmin()` check
- Non-admin users redirected to /dashboard
- Check happens at layout level before any child component renders

## Performance Notes

### Indexed Fields
- `knowledge_files.knowledge_source_id` (idx_knowledge_files_knowledge_source_id)
- `knowledge_files.uploaded_by_user_id` (idx_knowledge_files_uploaded_by_user_id)
- `knowledge_file_analysis.status` (idx_knowledge_file_analysis_status)
- `knowledge_sources.library_id` (idx_knowledge_sources_library_id)
- `knowledge_libraries.workspace_id` (idx_knowledge_libraries_workspace_id)
- `workspaces.organization_id` (idx_workspaces_organization_id)

### Query Strategy
- Initial page load fetches ALL files (no pagination yet)
- Filter options queried in parallel with initial files
- Client-side filtering/sorting (efficient for <10k files)
- Aggregations (top user, top workspace) done in JS after fetch

### Recommendations for Scale
- Add pagination when file count > 10,000
- Move workspace aggregation to Prisma aggregation query
- Add database views for common filters
- Implement caching for stats (5-min TTL)
- Add search index on file_name for large datasets

## Related Sections

- **Admin Usuarios** (`/admin/users`) - View uploader information
- **Knowledge Module** (`/knowledge`) - Upload files, manage libraries
- **Knowledge Admin Activity** (future) - Audit trail for storage operations
