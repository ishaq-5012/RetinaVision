-- Creates the public "retinal-scans" bucket used for uploaded fundus images.
-- The access policies already exist from setup_all.sql.
INSERT INTO storage.buckets (id, name, public)
VALUES ('retinal-scans', 'retinal-scans', true)
ON CONFLICT (id) DO UPDATE SET public = true;
